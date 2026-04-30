"""
Kafka Producer v2 — Multi-source, real payload-based enrichment.
Reads both london.csv and singapore.csv concurrently, classifies
payload signatures, maps ports to services, and streams to Kafka.
"""
import csv
import json
import time
import random
import threading
from datetime import datetime
from kafka import KafkaProducer

KAFKA_BOOTSTRAP = "localhost:9092"
TOPIC           = "network-logs"
LONDON_FILE     = "data/london.csv"
SINGAPORE_FILE  = "data/singapore.csv"

PORT_SERVICE = {
    "21": "FTP", "22": "SSH", "23": "Telnet", "25": "SMTP",
    "53": "DNS", "80": "HTTP", "110": "POP3", "143": "IMAP",
    "443": "HTTPS", "445": "SMB", "1433": "MSSQL", "3306": "MySQL",
    "3389": "RDP", "5432": "PostgreSQL", "5900": "VNC",
    "6379": "Redis", "8080": "HTTP-Alt", "8443": "HTTPS-Alt",
    "27017": "MongoDB", "9200": "Elasticsearch",
}

CITIES = ["London", "Singapore", "USA", "Russia", "China", "India", "Brazil", "UK"]

def classify_payload(payload: str, port: str) -> str:
    if "\\x16\\x03" in payload or "\x16\x03" in payload:
        return "TLS"
    if "jsonrpc" in payload.lower() or "eth_" in payload.lower():
        return "JSONRPC"
    if "POST" in payload:
        return "HTTP_POST"
    if "GET" in payload or "HEAD" in payload:
        return "HTTP_GET"
    if port in ("22", "23", "21", "3389", "5900", "1433", "3306"):
        return "AUTH"
    return "UNKNOWN"


def make_event(row: dict, source_file: str) -> dict:
    ip      = row.get("from", "0.0.0.0").strip().strip("'\"")
    port    = row.get("port", "0").strip().strip("'\"")
    payload = row.get("payload", "").strip().strip("'\"")
    src     = random.choice(CITIES)
    dst     = random.choice([c for c in CITIES if c != src])
    return {
        "time":         datetime.now().strftime("%m/%d/%Y, %H:%M:%S"),
        "ip":           ip,
        "port":         port,
        "src_country":  src,
        "dst_country":  dst,
        "payload":      payload[:200],          # cap payload size
        "payload_type": classify_payload(payload, port),
        "service":      PORT_SERVICE.get(port, f"PORT-{port}"),
        "source":       "london" if "london" in source_file else "singapore",
    }


def stream_file(producer: KafkaProducer, filepath: str, interval: float):
    print(f"[Producer] Streaming {filepath}")
    while True:
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                for row in csv.DictReader(f):
                    event = make_event(row, filepath)
                    producer.send(TOPIC, value=event)
                    print(f"[{event['source'].upper()}] {event['ip']}:{event['port']} "
                          f"({event['payload_type']}) {event['src_country']} → {event['dst_country']}")
                    time.sleep(interval)
        except FileNotFoundError:
            print(f"[Producer] ERROR: {filepath} not found.")
            time.sleep(10)
        except KeyboardInterrupt:
            break


def _send(producer, event, label):
    producer.send(TOPIC, value=event)
    print(f"[ATTACK-SIM] {label}: {event['ip']}:{event['port']} "
          f"{event['src_country']} → {event['dst_country']}")


def inject_attack_bursts(producer: KafkaProducer):
    """
    Every 25 seconds inject synthetic bursts so Flink CEP fires
    all three pattern types, not just Port Scan.

    Brute Force — same IP sweeps multiple auth services in quick succession.
    DDoS        — multiple distinct IPs flood the same port within the window.
    """
    AUTH_PORTS  = ["22", "21", "23", "3389", "5900", "1433", "3306", "5432"]
    DDOS_PORTS  = ["80", "443", "8080", "53", "25"]
    CITIES      = ["London", "Singapore", "USA", "Russia", "China", "India", "Brazil", "UK"]

    # Fixed attacker IPs for brute force (same IP must reappear)
    BRUTE_IPS = [
        "10.0.0.1", "10.0.0.2", "10.0.0.3",
        "192.168.1.10", "192.168.1.11",
    ]

    while True:
        try:
            time.sleep(25)

            now = datetime.now().strftime("%m/%d/%Y, %H:%M:%S")

            # ── Brute Force burst ──────────────────────────────────────────
            # Pick one attacker IP and send it against 3 different auth ports
            # quickly → Flink sees same IP + 2+ auth ports in 60s
            bf_ip  = random.choice(BRUTE_IPS)
            bf_src = random.choice(CITIES)
            bf_dst = random.choice([c for c in CITIES if c != bf_src])
            for port in random.sample(AUTH_PORTS, 3):
                _send(producer, {
                    "time":         now,
                    "ip":           bf_ip,
                    "port":         port,
                    "src_country":  bf_src,
                    "dst_country":  bf_dst,
                    "payload":      f"AUTH attempt on port {port}",
                    "payload_type": "AUTH",
                    "service":      PORT_SERVICE.get(port, f"PORT-{port}"),
                    "source":       "attack-sim",
                }, f"BRUTE_FORCE")
                time.sleep(0.3)

            # ── DDoS burst ─────────────────────────────────────────────────
            # 5 different IPs all hammering the same port → Flink sees
            # 4+ unique IPs on same port in 60s
            ddos_port = random.choice(DDOS_PORTS)
            ddos_dst  = random.choice(CITIES)
            for i in range(5):
                ddos_ip = f"172.16.{random.randint(0,255)}.{random.randint(1,254)}"
                ddos_src = random.choice([c for c in CITIES if c != ddos_dst])
                _send(producer, {
                    "time":         now,
                    "ip":           ddos_ip,
                    "port":         ddos_port,
                    "src_country":  ddos_src,
                    "dst_country":  ddos_dst,
                    "payload":      f"GET / HTTP/1.1",
                    "payload_type": "HTTP_GET",
                    "service":      PORT_SERVICE.get(ddos_port, f"PORT-{ddos_port}"),
                    "source":       "attack-sim",
                }, f"DDOS")
                time.sleep(0.2)

        except KeyboardInterrupt:
            break


def main():
    print(f"[Producer v2] Connecting to Kafka @ {KAFKA_BOOTSTRAP}…")
    producer = KafkaProducer(
        bootstrap_servers=[KAFKA_BOOTSTRAP],
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        acks="all",
        retries=3,
    )
    print(f"[Producer v2] Connected. Publishing to '{TOPIC}'")
    print(f"[Producer v2] Streaming BOTH datasets concurrently…")

    # London at ~1.3 events/s, Singapore at ~0.9 events/s — irregular so UI increments vary
    t1 = threading.Thread(target=stream_file, args=(producer, LONDON_FILE, 0.77), daemon=True)
    t2 = threading.Thread(target=stream_file, args=(producer, SINGAPORE_FILE, 1.1), daemon=True)
    # Attack simulator — injects Brute Force + DDoS bursts every 25s
    t3 = threading.Thread(target=inject_attack_bursts, args=(producer,), daemon=True)
    t1.start()
    t2.start()
    t3.start()
    print("[Producer v2] Attack simulator active — Brute Force + DDoS bursts every 25s")

    try:
        t1.join()
        t2.join()
        t3.join()
    except KeyboardInterrupt:
        print("\n[Producer v2] Shutting down…")
    finally:
        producer.flush()
        producer.close()


if __name__ == "__main__":
    main()
