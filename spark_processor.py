"""
Spark Structured Streaming Processor
- Consumes from Kafka 'network-logs' topic
- Real rule-based threat classification (no random)
- Stateful 5-minute windowed aggregation
- Outputs classified events to output_v4/threats/
"""
import os
import shutil

os.environ["PYSPARK_SUBMIT_ARGS"] = (
    "--packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1 pyspark-shell"
)

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, from_json, to_timestamp, when, window,
    count, approx_count_distinct,
)
from pyspark.sql.types import StructType, StringType

OUTPUT_DIR      = "./output_v4"
THREATS_PATH    = f"{OUTPUT_DIR}/threats"
CHECKPOINTS     = f"{OUTPUT_DIR}/checkpoints"
WIN_PATH        = f"{OUTPUT_DIR}/window_stats"
WIN_CHECKPOINTS = f"{OUTPUT_DIR}/win_checkpoints"


def classify(df):
    """
    Rule-based threat classification using port number + payload type.
    No randomness — every event carries a deterministic signal.
    """
    df = df.withColumn(
        "attack_type",
        when(col("payload_type") == "TLS",     "TLS Exploit")
        .when(col("payload_type") == "JSONRPC", "Blockchain Exploit")
        .when(col("payload_type") == "HTTP_POST", "HTTP Injection")
        .when(col("port").isin("22", "23", "21", "3389", "5900", "1433", "3306", "5432"), "Brute Force")
        .when(col("port").cast("int") < 1024,   "Port Scan")
        .when(col("payload_type") == "HTTP_GET", "Recon Probe")
        .otherwise("Network Probe"),
    )
    df = df.withColumn(
        "threat_level",
        when(col("attack_type").isin("TLS Exploit", "Blockchain Exploit"), "CRITICAL")
        .when(col("attack_type").isin("Brute Force", "HTTP Injection"),    "HIGH")
        .when(col("attack_type").isin("Port Scan", "Recon Probe"),         "MEDIUM")
        .otherwise("LOW"),
    )
    return df


def process_stream():
    if os.path.exists(OUTPUT_DIR):
        print(f"[Spark] Clearing {OUTPUT_DIR} for fresh start…")
        shutil.rmtree(OUTPUT_DIR)

    spark = (
        SparkSession.builder
        .appName("CyberThreatDetection-v4")
        .master("local[*]")
        .config("spark.hadoop.fs.defaultFS", "file:///")
        .config("spark.sql.streaming.forceDeleteTempCheckpointLocation", "true")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    schema = (
        StructType()
        .add("time",         StringType())
        .add("ip",           StringType())
        .add("port",         StringType())
        .add("src_country",  StringType())
        .add("dst_country",  StringType())
        .add("payload",      StringType())
        .add("payload_type", StringType())
        .add("service",      StringType())
        .add("source",       StringType())
    )

    # ── 1. Read from Kafka ────────────────────────────────────────────────
    raw = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", "localhost:9092")
        .option("subscribe", "network-logs")
        .option("startingOffsets", "latest")
        .option("failOnDataLoss", "false")
        .load()
    )

    # ── 2. Parse JSON ─────────────────────────────────────────────────────
    parsed = (
        raw.selectExpr("CAST(value AS STRING)")
        .select(from_json(col("value"), schema).alias("d"))
        .select("d.*")
    )

    # ── 3. Timestamp + classification ─────────────────────────────────────
    ts = parsed.withColumn(
        "event_time",
        to_timestamp(col("time"), "MM/dd/yyyy, HH:mm:ss"),
    )
    classified = classify(ts)

    # ── 4. Final shape for event sink ─────────────────────────────────────
    events = classified.select(
        col("ip"),
        col("attack_type"),
        col("threat_level"),
        col("src_country"),
        col("dst_country"),
        col("port"),
        col("service"),
        col("payload_type"),
        col("source"),
        col("event_time").cast("string").alias("timestamp"),
    )

    # ── 5. Windowed aggregation (5-min tumbling) ───────────────────────────
    windowed = (
        classified
        .withWatermark("event_time", "10 minutes")
        .groupBy(
            window("event_time", "5 minutes"),
            "attack_type",
            "threat_level",
            "src_country",
        )
        .agg(
            count("*").alias("event_count"),
            approx_count_distinct("ip").alias("unique_ips"),
        )
        .select(
            col("window.start").cast("string").alias("window_start"),
            col("window.end").cast("string").alias("window_end"),
            col("attack_type"),
            col("threat_level"),
            col("src_country"),
            col("event_count"),
            col("unique_ips"),
        )
    )

    # ── 6. Write raw events ────────────────────────────────────────────────
    print("=" * 60)
    print("[Spark] Pipeline starting → output_v4/threats/")
    print("=" * 60)

    events.writeStream \
        .outputMode("append") \
        .format("json") \
        .option("path", THREATS_PATH) \
        .option("checkpointLocation", CHECKPOINTS) \
        .trigger(processingTime="3 seconds") \
        .start()

    # ── 7. Write windowed stats ────────────────────────────────────────────
    windowed.writeStream \
        .outputMode("append") \
        .format("json") \
        .option("path", WIN_PATH) \
        .option("checkpointLocation", WIN_CHECKPOINTS) \
        .trigger(processingTime="30 seconds") \
        .start()

    spark.streams.awaitAnyTermination()


if __name__ == "__main__":
    process_stream()
