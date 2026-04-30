"""
FastAPI Backend — Cyber Threat Intelligence API
Serves threats, Flink CEP alerts, and GraphX graph data.
SESSION_START gates all loaders — only data written after this API process
started is returned, so every restart is a clean zero.
"""
import glob
import json
import asyncio
import subprocess
import sys
import os
import time
import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Cyber Threat Intelligence API v2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_THREAT_DIRS = [
    "./output_v4/threats/*.json",
    "./output_v3/threats/*.json",
    "./output_v2/threats/*.json",
]
ALERTS_FILE = "./flink_alerts.json"
GRAPH_FILE  = "./output_graph/graph_data.json"

# Set at startup — only files/records newer than this are served.
SESSION_START: float = 0.0


# ── Data loaders ──────────────────────────────────────────────────────────────

def load_threats() -> list:
    """Only load JSON files written after this API process started."""
    for pattern in _THREAT_DIRS:
        # Filter by file mtime so pre-session Spark batches are ignored
        files = [
            f for f in glob.glob(pattern)
            if os.path.getmtime(f) >= SESSION_START
        ]
        if not files:
            continue
        threats = []
        for path in files:
            try:
                with open(path) as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            threats.append(json.loads(line))
            except (OSError, json.JSONDecodeError):
                continue
        if threats:
            return threats
    return []


def load_alerts() -> list:
    """Return only alerts whose timestamp is after session start."""
    try:
        with open(ALERTS_FILE) as f:
            data = json.load(f)
        if not isinstance(data, list):
            return []
        result = []
        for alert in data:
            ts_str = alert.get("timestamp", "")
            if not ts_str:
                continue
            try:
                ts = datetime.datetime.fromisoformat(ts_str).timestamp()
                if ts >= SESSION_START:
                    result.append(alert)
            except (ValueError, OSError):
                pass
        return result
    except (OSError, json.JSONDecodeError):
        return []


def load_graph() -> dict:
    """Only serve graph data generated after session start."""
    try:
        if os.path.getmtime(GRAPH_FILE) < SESSION_START:
            return {}
        with open(GRAPH_FILE) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def compute_stats(threats: list, alerts: list) -> dict:
    levels     = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    types: dict  = {}
    unique_ips: set = set()

    for t in threats:
        lv = t.get("threat_level", "LOW")
        levels[lv] = levels.get(lv, 0) + 1
        at = t.get("attack_type", "Unknown")
        types[at] = types.get(at, 0) + 1
        if t.get("ip"):
            unique_ips.add(t["ip"])

    return {
        "total":        len(threats),
        "critical":     levels.get("CRITICAL", 0),
        "high":         levels.get("HIGH", 0),
        "medium":       levels.get("MEDIUM", 0),
        "low":          levels.get("LOW", 0),
        "unique_ips":   len(unique_ips),
        "attack_types": types,
        "total_alerts": len(alerts),
    }


# ── WebSocket manager ─────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.add(ws)

    def disconnect(self, ws: WebSocket):
        self._connections.discard(ws)

    async def broadcast(self, payload: dict):
        dead = set()
        for ws in self._connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        self._connections -= dead

    @property
    def count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


async def _broadcast_loop():
    """Push session-scoped data to all WebSocket clients every 2 seconds."""
    while True:
        await asyncio.sleep(2)
        if manager.count == 0:
            continue
        threats = load_threats()
        alerts  = load_alerts()
        graph   = load_graph()
        stats   = compute_stats(threats, alerts)
        await manager.broadcast({
            "threats":   threats,
            "alerts":    alerts,
            "graphData": graph,
            "stats":     stats,
        })


@app.on_event("startup")
async def startup():
    global SESSION_START
    SESSION_START = time.time()   # everything before this moment is ignored
    asyncio.create_task(_broadcast_loop())


# ── REST endpoints ────────────────────────────────────────────────────────────

@app.get("/threats")
def get_threats():
    return load_threats()


@app.get("/alerts")
def get_alerts():
    return load_alerts()


@app.get("/graph")
def get_graph():
    return load_graph()


@app.get("/stats")
def get_stats():
    threats = load_threats()
    alerts  = load_alerts()
    return compute_stats(threats, alerts)


@app.post("/graphx/run")
async def trigger_graphx():
    """Kick off the GraphX batch analysis job."""
    try:
        subprocess.Popen(
            [sys.executable, "graphx_analysis.py"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"status": "started", "message": "GraphX analysis running in background"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        threats = load_threats()
        alerts  = load_alerts()
        graph   = load_graph()
        await ws.send_json({
            "threats":   threats,
            "alerts":    alerts,
            "graphData": graph,
            "stats":     compute_stats(threats, alerts),
        })
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)
