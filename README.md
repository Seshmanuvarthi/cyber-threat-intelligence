# Cyber Threat Intelligence Pipeline

A real-time Big Data Analytics pipeline that ingests live network traffic, detects cyberattacks, maps global threat flows, and displays everything on a live dashboard — updating every 2 seconds.

---

## Architecture Overview

```
CSV Datasets (London + Singapore)
           │
           ▼
     [ Apache Kafka ]          ← message queue / event highway
           │
    ┌──────┴──────┐
    ▼             ▼
[ Spark ]     [ Flink CEP ]    ← two independent consumers
Classifies    Detects patterns
every event   across time windows
    │             │
    ▼             ▼
output_v4/   flink_alerts.json
threats/
    │             │
    └──────┬──────┘
           ▼
      [ GraphX ]               ← batch graph analysis (run manually)
    PageRank · Components
           │
           ▼
    output_graph/
    graph_data.json
           │
           ▼
     [ FastAPI ]               ← WebSocket + REST backend
           │
           ▼
  [ React Dashboard ]          ← live UI, updates every 2s
```

---

## Technologies Used

| Layer | Technology | Purpose |
|---|---|---|
| Ingestion | Apache Kafka | Event streaming from two datasets concurrently |
| Processing | Apache Spark Structured Streaming | Rule-based threat classification |
| CEP | Flink-style CEP Engine | Multi-event attack pattern detection |
| Graph | GraphX-style PySpark | PageRank · connected components · threat centrality |
| Backend | FastAPI + WebSocket | Real-time data push to dashboard |
| Frontend | React + Tailwind CSS | Live threat intelligence dashboard |
| Map | React Leaflet + CartoDB | Global attack map with animated arcs |
| Charts | Recharts | Timeline and distribution charts |

---

## What It Detects

### Spark — Event Classification

Every network event is classified in real time:

| Attack Type | Trigger | Severity |
|---|---|---|
| TLS Exploit | TLS handshake payload (`\x16\x03`) | CRITICAL |
| Blockchain Exploit | JSONRPC / `eth_` payload | CRITICAL |
| Brute Force | Auth port (SSH/RDP/MySQL/FTP...) | HIGH |
| HTTP Injection | HTTP POST payload | HIGH |
| Port Scan | System port (< 1024) | MEDIUM |
| Recon Probe | HTTP GET payload | MEDIUM |
| Network Probe | Everything else | LOW |

### Flink CEP — Pattern Detection

Detects attack campaigns across sequences of events using sliding time windows:

| Pattern | Trigger | Window |
|---|---|---|
| Port Scan | Same IP hits 5+ different ports | 30 seconds |
| Brute Force | Same IP sweeps 2+ auth services | 60 seconds |
| DDoS Burst | 4+ unique IPs flood same port | 60 seconds |

### GraphX — Network Analysis

Treats the threat data as a directed graph (countries = nodes, attacks = edges) and computes:

- **PageRank** — which country is the most central threat actor in the network
- **In/Out Degree** — how many attacks each country sends vs receives
- **Connected Components** — which countries belong to the same attack cluster
- **Top Attacker IPs** — most frequent source IPs with their PageRank score

---

## Dashboard Panels

| Panel | Data Source | What It Shows |
|---|---|---|
| Stat Cards | Spark + Flink | Total events, Critical/High/Medium counts, Unique IPs, CEP Alerts |
| Global Attack Map | Spark | Animated arcs on world map, coloured by severity |
| Flink CEP Alerts | Flink CEP | Live feed of Port Scan / Brute Force / DDoS detections |
| GraphX Network | GraphX | Circular graph — node size = PageRank, arrows = attack flow |
| Attack Timeline | Spark (React) | Events per minute per attack type |
| Attack Distribution | Spark (React) | Bar chart of attack type frequency |
| Top Attackers | Spark + GraphX | Ranked IPs with hit count and PageRank bar |
| Live Threat Feed | Spark | Scrolling log of every classified event, newest at top |

---

## Project Structure

```
cyber-threat-intelligence/
│
├── producer_v2.py          # Kafka producer — streams both CSVs + attack simulator
├── spark_processor.py      # Spark Structured Streaming — classifies threats
├── flink_cep.py            # Flink-style CEP engine — detects attack patterns
├── graphx_analysis.py      # GraphX-style PySpark — PageRank + graph analytics
├── main.py                 # FastAPI backend — WebSocket + REST endpoints
├── requirements.txt        # Python dependencies
├── COMMANDS.md             # Step-by-step terminal commands
│
└── dashboard/
    ├── src/
    │   ├── App.jsx                      # Root — WebSocket + polling logic
    │   └── components/
    │       ├── Header.jsx               # Pipeline status + live event counter
    │       ├── StatsCards.jsx           # 6 metric cards
    │       ├── AttackMap.jsx            # Leaflet world map with bezier arcs
    │       ├── AlertFeed.jsx            # Flink CEP alert feed
    │       ├── NetworkGraph.jsx         # SVG circular graph with PageRank
    │       ├── ThreatTimeline.jsx       # Recharts line chart per minute
    │       ├── ThreatChart.jsx          # Recharts bar chart by attack type
    │       ├── TopAttackers.jsx         # IP table with PageRank bars
    │       └── ThreatFeed.jsx           # Live scrolling threat log
    ├── tailwind.config.js
    └── package.json
```

---

## Setup & Installation

### Prerequisites

- Python 3.9+
- Node.js 18+
- Apache Kafka + Zookeeper (via Homebrew on Mac)
- Java 11+ (required by Spark)

### 1. Clone the repository

```bash
git clone https://github.com/Seshmanuvarthi/cyber-threat-intelligence.git
cd cyber-threat-intelligence
```

### 2. Add datasets

Place your network traffic CSV files in the `data/` folder:

```
data/
├── london.csv       # London network traffic logs
└── singapore.csv    # Singapore network traffic logs
```

Expected CSV columns: `from` (IP address), `port`, `payload`

### 3. Python environment

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Dashboard dependencies

```bash
cd dashboard
npm install
cd ..
```

---

## Running the Pipeline

> Always follow this start order: Kafka → Spark → Producer → Flink → API → Dashboard → GraphX

### Terminal 1 — Kafka

```bash
brew services start zookeeper
brew services start kafka
```

### Terminal 2 — Spark Processor

```bash
source venv/bin/activate
python spark_processor.py
```

### Terminal 3 — Kafka Producer

```bash
source venv/bin/activate
python producer_v2.py
```

### Terminal 4 — Flink CEP

```bash
source venv/bin/activate
python flink_cep.py
```

### Terminal 5 — FastAPI Backend

```bash
source venv/bin/activate
uvicorn main:app --port 8000
```

### Terminal 6 — React Dashboard

```bash
cd dashboard
npm run dev
```

Open **http://localhost:5173**

### Terminal 7 — GraphX (run after ~1 minute of data)

```bash
source venv/bin/activate
python graphx_analysis.py
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/threats` | All classified threat events |
| GET | `/alerts` | Flink CEP pattern alerts |
| GET | `/graph` | GraphX network graph data |
| GET | `/stats` | Aggregated statistics |
| POST | `/graphx/run` | Trigger GraphX batch analysis |
| WS | `/ws` | WebSocket — pushes all data every 2 seconds |

---

## Key Design Decisions

**Session-based data isolation** — Every time the API starts, a `SESSION_START` timestamp is recorded. Only threat files written after this timestamp are served, so the dashboard always starts from zero.

**WebSocket with polling fallback** — The dashboard connects via WebSocket for real-time push. If the WebSocket fails, it automatically falls back to HTTP polling every 2.5 seconds and retries WebSocket every 5 seconds.

**Circular graph layout** — The NetworkGraph uses a fixed circular SVG layout instead of force-directed physics. Force-directed fails on near-complete graphs (every country attacks every other country) because edge attraction overwhelms node repulsion. Circular layout gives clean, readable results regardless of edge density.

**Attack simulation** — The producer injects synthetic Brute Force and DDoS bursts every 25 seconds alongside real CSV data, because the raw datasets contain randomised high-number ports that never naturally produce these patterns.

---

## Clean Stop

```bash
# Stop services
brew services stop kafka
brew services stop zookeeper

# Stop all Python processes
Ctrl+C in each terminal

# Stop dashboard
Ctrl+C in dashboard terminal
```
