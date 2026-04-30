# BDA Cyber Threat Intelligence Pipeline — Run Commands

## Start Order
> Always follow this order: Kafka → Spark → Producer → Flink → API → Dashboard → GraphX

---

## Terminal 1 — Kafka (Zookeeper + Broker) (Macbook)
```bash
brew services start zookeeper
brew services start kafka
```
To stop:
```bash
brew services stop kafka
brew services stop zookeeper
```
Check status:
```bash
brew services list
```

---

## Terminal 2 — Spark Processor
```bash
cd /Users/praneethnukala/Documents/BDA_CaseStudyy
source venv/bin/activate
python spark_processor.py
```
> Consumes from Kafka `network-logs` topic. Writes classified threat events to `output_v4/threats/`.

---

## Terminal 3 — Kafka Producer (Both Datasets)
```bash
cd /Users/praneethnukala/Documents/BDA_CaseStudyy
source venv/bin/activate
python producer_v2.py
```
> Streams both `london.csv` and `singapore.csv` concurrently to Kafka.

---

## Terminal 4 — Flink CEP (Pattern Detection)
```bash
cd /Users/praneethnukala/Documents/BDA_CaseStudyy
source venv/bin/activate
python flink_cep.py
```
> Detects Port Scan, Brute Force, DDoS patterns. Writes alerts to `flink_alerts.json`.

---

## Terminal 5 — FastAPI Backend
```bash
cd /Users/praneethnukala/Documents/BDA_CaseStudyy
source venv/bin/activate
uvicorn main:app --port 8000
```
> Serves data at `http://localhost:8000`. WebSocket at `ws://localhost:8000/ws`.

Endpoints:
- `GET /threats` — all processed threat events
- `GET /alerts`  — Flink CEP alerts
- `GET /graph`   — GraphX network graph data
- `GET /stats`   — aggregated statistics
- `WS  /ws`      — real-time push (2s interval)

---

## Terminal 6 — React Dashboard
```bash
cd /Users/praneethnukala/Documents/BDA_CaseStudyy/dashboard
npm run dev
```
> Opens at **http://localhost:5173**

---

## Terminal 7 — GraphX Batch Analysis
```bash
cd /Users/praneethnukala/Documents/BDA_CaseStudyy
source venv/bin/activate
python graphx_analysis.py
```
> Run once after ~1 minute of data accumulation. Re-run any time to refresh the network graph.
> Writes to `output_graph/graph_data.json`. Auto-detects `output_v4` → `output_v3` → `output_v2`.

---

## Quick Reference

| Component   | Script                  | Output                          |
|-------------|-------------------------|---------------------------------|
| Kafka       | brew services           | Topic: `network-logs`           |
| Spark       | `spark_processor.py`    | `output_v4/threats/*.json`      |
| Producer    | `producer_v2.py`        | → Kafka topic                   |
| Flink CEP   | `flink_cep.py`          | `flink_alerts.json`             |
| GraphX      | `graphx_analysis.py`    | `output_graph/graph_data.json`  |
| API         | `uvicorn main:app`      | `localhost:8000`                |
| Dashboard   | `npm run dev`           | `localhost:5173`                |
