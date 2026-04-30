"""
GraphX-style Threat Network Analysis (PySpark implementation)
Builds a directed threat graph from processed events and computes:
  - PageRank  (iterative, damping=0.85)
  - In / Out degree centrality
  - Top attack corridors (src→dst pairs)
  - Weakly connected components (union-find)

Reads from output_v4/threats/, writes graph_data.json.
Run as a standalone batch job: python graphx_analysis.py
"""
import os
import json
import sys
import datetime

os.environ["PYSPARK_SUBMIT_ARGS"] = (
    "--packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1 pyspark-shell"
)

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count

# Prefer v4 (new pipeline), fall back to v3 (previous runs), then v2
_CANDIDATES = ["./output_v4/threats", "./output_v3/threats", "./output_v2/threats"]
THREATS_PATH  = next((p for p in _CANDIDATES if os.path.isdir(p) and any(
    f.endswith(".json") for f in os.listdir(p)
)), None)
OUTPUT_FILE   = "output_graph/graph_data.json"
DAMPING       = 0.85
ITERATIONS    = 20


# ── Union-Find for connected components ──────────────────────────────────────
class UnionFind:
    def __init__(self):
        self.parent: dict = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def compute_pagerank(edges: list, nodes: set, iterations: int = ITERATIONS) -> dict:
    """Iterative PageRank on Python dicts (runs after Spark aggregation)."""
    n       = len(nodes)
    ranks   = {node: 1.0 / n for node in nodes}
    out_deg = {node: 0 for node in nodes}
    adj     = {node: [] for node in nodes}

    for e in edges:
        src, dst = e["source"], e["target"]
        out_deg[src] = out_deg.get(src, 0) + e["weight"]
        adj[src].append((dst, e["weight"]))

    for _ in range(iterations):
        new_ranks = {node: (1 - DAMPING) / n for node in nodes}
        for src in nodes:
            total_out = out_deg.get(src, 0) or 1
            for dst, w in adj.get(src, []):
                contrib = DAMPING * ranks[src] * (w / total_out)
                new_ranks[dst] = new_ranks.get(dst, 0) + contrib
        ranks = new_ranks

    return ranks


def run_analysis():
    os.makedirs("output_graph", exist_ok=True)

    spark = (
        SparkSession.builder
        .appName("CyberThreatGraphX")
        .master("local[*]")
        .config("spark.hadoop.fs.defaultFS", "file:///")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")

    # ── Load threats ────────────────────────────────────────────────────
    if not THREATS_PATH:
        print("[GraphX] No threat data found in any output directory.")
        print("[GraphX] Checked: output_v4/threats, output_v3/threats, output_v2/threats")
        print("[GraphX] Run spark_processor.py first to generate threat data.")
        spark.stop()
        return

    print(f"[GraphX] Loading threats from: {THREATS_PATH}")

    df = spark.read.json(THREATS_PATH)
    required = {"src_country", "dst_country", "ip", "attack_type", "threat_level"}
    if not required.issubset(set(df.columns)):
        print(f"[GraphX] Schema missing columns. Found: {df.columns}")
        spark.stop()
        return

    total = df.count()
    print(f"[GraphX] Loaded {total} threat events.")

    # ── Build edge list (src_country → dst_country) ─────────────────────
    edge_df = (
        df.groupBy("src_country", "dst_country", "attack_type")
        .agg(count("*").alias("weight"))
        .filter(col("src_country").isNotNull() & col("dst_country").isNotNull())
    )
    edges_raw = edge_df.collect()

    # Collapse per src→dst pair (summing across attack types)
    edge_map: dict = {}
    attack_breakdown: dict = {}
    for row in edges_raw:
        key = (row.src_country, row.dst_country)
        edge_map[key] = edge_map.get(key, 0) + row.weight
        if key not in attack_breakdown:
            attack_breakdown[key] = {}
        attack_breakdown[key][row.attack_type] = (
            attack_breakdown[key].get(row.attack_type, 0) + row.weight
        )

    edges = [
        {
            "source":       k[0],
            "target":       k[1],
            "weight":       v,
            "attack_types": attack_breakdown[k],
        }
        for k, v in edge_map.items()
    ]

    # ── Build node set ───────────────────────────────────────────────────
    node_names = set()
    for e in edges:
        node_names.add(e["source"])
        node_names.add(e["target"])

    sent_counts     = {n: 0 for n in node_names}
    received_counts = {n: 0 for n in node_names}
    for e in edges:
        sent_counts[e["source"]]     += e["weight"]
        received_counts[e["target"]] += e["weight"]

    # ── PageRank ─────────────────────────────────────────────────────────
    pr = compute_pagerank(edges, node_names)
    max_pr = max(pr.values()) or 1.0

    # ── Connected components (union-find) ─────────────────────────────────
    uf = UnionFind()
    for e in edges:
        uf.union(e["source"], e["target"])
    component_map = {n: uf.find(n) for n in node_names}

    # ── Top IPs by frequency ─────────────────────────────────────────────
    ip_df = (
        df.groupBy("ip", "src_country", "attack_type")
        .agg(count("*").alias("hits"))
        .orderBy(col("hits").desc())
        .limit(10)
    )
    top_ips = [
        {
            "ip":          row.ip,
            "src_country": row.src_country,
            "attack_type": row.attack_type,
            "hits":        row.hits,
            "pagerank":    round(pr.get(row.src_country, 0) / max_pr, 4),
        }
        for row in ip_df.collect()
    ]

    # ── Severity breakdown ───────────────────────────────────────────────
    sev_df = (
        df.groupBy("threat_level")
        .agg(count("*").alias("count"))
    )
    severity = {row.threat_level: row["count"] for row in sev_df.collect()}

    # ── Assemble output ───────────────────────────────────────────────────
    nodes = [
        {
            "id":               n,
            "label":            n,
            "threats_sent":     sent_counts[n],
            "threats_received": received_counts[n],
            "pagerank":         round(pr.get(n, 0) / max_pr, 4),
            "component_id":     component_map[n],
        }
        for n in node_names
    ]
    nodes.sort(key=lambda x: x["pagerank"], reverse=True)

    output = {
        "nodes":        nodes,
        "edges":        edges,
        "top_attackers": top_ips,
        "severity":     severity,
        "total_events": total,
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"[GraphX] Graph written → {OUTPUT_FILE}")
    print(f"[GraphX] Nodes: {len(nodes)} | Edges: {len(edges)} | "
          f"Top IP: {top_ips[0]['ip'] if top_ips else 'N/A'}")

    spark.stop()


if __name__ == "__main__":
    run_analysis()
