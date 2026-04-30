"""
Flink-Style CEP (Complex Event Processing) Engine
Implements the same algorithmic patterns as Apache Flink CEP:
  - Pattern 1: Port Scan   (5+ unique ports from same IP within 30s)
  - Pattern 2: Brute Force (2+ different auth services swept by same IP within 60s)
  - Pattern 3: DDoS        (4+ unique IPs targeting same port within 60s)

Reads from Kafka 'network-logs' (separate consumer group from Spark),
writes detected alerts to flink_alerts.json.
"""
import json
import time
import signal
import datetime
from collections import defaultdict
from threading import Lock
from kafka import KafkaConsumer

KAFKA_BOOTSTRAP = "localhost:9092"
TOPIC           = "network-logs"
GROUP_ID        = "flink-cep-group"
ALERTS_FILE     = "flink_alerts.json"
MAX_ALERTS      = 200

AUTH_PORTS = {"22", "21", "23", "3389", "5900", "1433", "3306", "5432", "110", "143"}
PORT_SERVICE = {
    "21": "FTP", "22": "SSH", "23": "Telnet",
    "3389": "RDP", "5900": "VNC", "1433": "MSSQL",
    "3306": "MySQL", "5432": "PostgreSQL",
}

_running = True

def _handle_signal(*_):
    global _running
    print("\n[Flink CEP] Shutdown signal received…")
    _running = False

signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


class FlinkCEPEngine:
    """Sliding-window CEP state machine."""

    def __init__(self):
        # ip → list of {ts, port, src, dst}
        self._ip_events:  dict = defaultdict(list)
        # port → list of {ts, ip, src}
        self._port_events: dict = defaultdict(list)
        self._alerts: list = []
        self._alert_id: int = 0
        self._lock = Lock()
        self._last_alert_key: dict = {}   # dedup: key → last alert ts

    # ── public ──────────────────────────────────────────────────────────
    def ingest(self, event: dict):
        now = time.time()
        ip   = event.get("ip",          "unknown")
        port = str(event.get("port",    "0"))
        src  = event.get("src_country", "Unknown")
        dst  = event.get("dst_country", "Unknown")

        e = {"ts": now, "port": port, "src": src, "dst": dst, "ip": ip}

        with self._lock:
            self._ip_events[ip].append(e)
            self._port_events[port].append({"ts": now, "ip": ip, "src": src})

            self._detect_port_scan(ip)
            self._detect_brute_force(ip, port, src, dst)
            self._detect_ddos(port)

            # Prune old state to cap memory
            if len(self._ip_events[ip]) > 200:
                self._ip_events[ip] = self._trim(self._ip_events[ip], 120)
            if len(self._port_events[port]) > 2000:
                self._port_events[port] = self._trim(self._port_events[port], 30)

    def get_alerts(self) -> list:
        with self._lock:
            return list(self._alerts)

    # ── patterns ────────────────────────────────────────────────────────
    def _detect_port_scan(self, ip: str):
        """Same IP hits ≥5 distinct ports in 30 s — report full count after window."""
        window  = 30
        recent  = self._trim(self._ip_events[ip], window)
        ports   = {e["port"] for e in recent}
        if len(ports) < 5:
            return
        key = f"PORT_SCAN:{ip}"
        # Cooldown of 30 s so we report the growing count, not always exactly 5
        if self._is_duplicate(key, cooldown=30):
            return
        last = recent[-1]
        severity = "CRITICAL" if len(ports) >= 15 else "HIGH"
        self._emit({
            "pattern":     "PORT_SCAN",
            "severity":    severity,
            "source_ip":   ip,
            "target_port": "MULTI",
            "description": (
                f"Port scan: {ip} probed {len(ports)} ports "
                f"({', '.join(sorted(ports)[:6])}{'…' if len(ports) > 6 else ''}) in {window}s"
            ),
            "event_count":   len(recent),
            "unique_ports":  len(ports),
            "src_country":   last["src"],
            "dst_country":   last["dst"],
        })

    def _detect_brute_force(self, ip: str, port: str, src: str, dst: str):
        """Same IP hits 2+ different auth ports in 60s (credential sweeping)."""
        if port not in AUTH_PORTS:
            return
        window  = 60
        # All auth-port hits from this IP regardless of which port
        recent      = [e for e in self._trim(self._ip_events[ip], window)
                       if e["port"] in AUTH_PORTS]
        auth_ports_hit = {e["port"] for e in recent}
        if len(auth_ports_hit) < 2:
            return
        key = f"BRUTE:{ip}"
        if self._is_duplicate(key, cooldown=90):
            return
        services = [PORT_SERVICE.get(p, f"Port-{p}") for p in sorted(auth_ports_hit)]
        self._emit({
            "pattern":     "BRUTE_FORCE",
            "severity":    "CRITICAL",
            "source_ip":   ip,
            "target_port": ", ".join(sorted(auth_ports_hit)),
            "description": (
                f"Credential sweep: {ip} probed {len(auth_ports_hit)} auth services "
                f"({', '.join(services[:4])}) in {window}s"
            ),
            "event_count":    len(recent),
            "service":        ", ".join(services),
            "auth_ports_hit": len(auth_ports_hit),
            "src_country":    src,
            "dst_country":    dst,
        })

    def _detect_ddos(self, port: str):
        """≥4 distinct IPs target same port in 60 s (coordinated flood)."""
        window      = 60
        recent      = self._trim(self._port_events[port], window)
        unique_ips  = {e["ip"] for e in recent}
        if len(unique_ips) < 4:
            return
        key = f"DDOS:{port}"
        if self._is_duplicate(key, cooldown=60):
            return
        service = PORT_SERVICE.get(port, f"Port-{port}")
        self._emit({
            "pattern":        "DDOS",
            "severity":       "CRITICAL",
            "source_ip":      f"{len(unique_ips)} distinct IPs",
            "target_port":    port,
            "description": (
                f"DDoS flood on {service} (:{port}): {len(unique_ips)} unique sources "
                f"in {window}s — {len(recent)} total hits"
            ),
            "event_count":      len(recent),
            "unique_attackers": len(unique_ips),
            "src_country":      "Multiple",
            "dst_country":      recent[-1]["src"] if recent else "Unknown",
        })

    # ── helpers ─────────────────────────────────────────────────────────
    @staticmethod
    def _trim(events: list, seconds: float) -> list:
        cutoff = time.time() - seconds
        return [e for e in events if e["ts"] > cutoff]

    def _is_duplicate(self, key: str, cooldown: float) -> bool:
        last = self._last_alert_key.get(key, 0)
        if time.time() - last < cooldown:
            return True
        self._last_alert_key[key] = time.time()
        return False

    def _emit(self, data: dict):
        self._alert_id += 1
        alert = {
            "id":        f"CEP-{self._alert_id:05d}",
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            **data,
        }
        self._alerts.append(alert)
        if len(self._alerts) > MAX_ALERTS:
            self._alerts = self._alerts[-MAX_ALERTS:]
        self._persist()
        sev = alert["severity"]
        print(f"[Flink CEP] [{sev}] {alert['pattern']} — {alert['description']}")

    def _persist(self):
        try:
            with open(ALERTS_FILE, "w") as f:
                json.dump(self._alerts[-100:], f, indent=2)
        except OSError:
            pass


def main():
    print(f"[Flink CEP] Starting — consuming '{TOPIC}' (group: {GROUP_ID})")
    engine = FlinkCEPEngine()

    consumer = KafkaConsumer(
        TOPIC,
        bootstrap_servers=[KAFKA_BOOTSTRAP],
        group_id=GROUP_ID,
        auto_offset_reset="latest",
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        consumer_timeout_ms=1000,
    )

    processed = 0
    while _running:
        try:
            for msg in consumer:
                if not _running:
                    break
                engine.ingest(msg.value)
                processed += 1
                if processed % 100 == 0:
                    print(f"[Flink CEP] Processed {processed} events | "
                          f"Alerts: {len(engine.get_alerts())}")
        except Exception as exc:
            if _running:
                print(f"[Flink CEP] Consumer error: {exc} — retrying in 3s")
                time.sleep(3)

    consumer.close()
    print(f"[Flink CEP] Stopped. Total events: {processed}")


if __name__ == "__main__":
    main()
