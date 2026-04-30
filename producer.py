import csv
import json
import time
import random
from kafka import KafkaProducer

KAFKA_TOPIC = "network-logs"
KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"
DATA_FILE = "data/london.csv"

def stream_data():
    print(f"Connecting to Kafka at {KAFKA_BOOTSTRAP_SERVERS}...")
    producer = KafkaProducer(
        bootstrap_servers=[KAFKA_BOOTSTRAP_SERVERS],
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    print(f"Connected! Publishing to topic: {KAFKA_TOPIC}")

    try:
        while True:
            with open(DATA_FILE, 'r') as file:
                # london.csv headers: "time","payload","from","port","country"
                reader = csv.DictReader(file)
                for row in reader:
                    # Strip potential single quotes from IP strings
                    ip = row["from"].strip().strip("'")
                    
                    # Generate distinct vector nodes
                    cities = ["London", "Singapore", "USA", "Russia", "China", "India", "Brazil", "UK"]
                    src = random.choice(cities)
                    dst = random.choice([c for c in cities if c != src])

                    from datetime import datetime
                    
                    # Format into JSON payload
                    event = {
                        "time": datetime.now().strftime("%m/%d/%Y, %H:%M:%S"),
                        "ip": ip,            
                        "port": row["port"],
                        "src_country": src,
                        "dst_country": dst,
                        "payload": row["payload"]
                    }
                    
                    # Send to Kafka
                    producer.send(KAFKA_TOPIC, value=event)
                    print(f"Sent event: {event}")
                    
                    # Prevent laptop throttling by extending gap to 5s as requested
                    time.sleep(5)

    except FileNotFoundError:
        print(f"Error: Could not find {DATA_FILE}. Make sure the dataset is in the 'data/' directory.")
    except KeyboardInterrupt:
        print("\nStopping producer...")
    finally:
        producer.flush()
        producer.close()

if __name__ == "__main__":
    stream_data()
