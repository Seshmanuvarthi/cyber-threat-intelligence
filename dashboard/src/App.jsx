import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';

import Header       from './components/Header';
import StatsCards   from './components/StatsCards';
import AttackMap    from './components/AttackMap';
import AlertFeed    from './components/AlertFeed';
import NetworkGraph from './components/NetworkGraph';
import ThreatTimeline from './components/ThreatTimeline';
import ThreatChart  from './components/ThreatChart';
import TopAttackers from './components/TopAttackers';
import ThreatFeed   from './components/ThreatFeed';

const API = 'http://localhost:8000';
const WS  = 'ws://localhost:8000/ws';

const fade = (delay = 0) => ({
  initial:    { opacity: 0, y: 18 },
  animate:    { opacity: 1, y: 0 },
  transition: { delay, duration: 0.45, ease: 'easeOut' },
});

export default function App() {
  const [threats,    setThreats]    = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [graphData,  setGraphData]  = useState(null);
  const [stats,      setStats]      = useState({});
  const [pipeline,   setPipeline]   = useState({
    kafka: false, spark: false, flink: false, graphx: false, api: false,
  });

  const wsRef       = useRef(null);
  const pollRef     = useRef(null);
  const wsAliveRef  = useRef(false);

  // ── HTTP polling fallback ───────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const [tRes, aRes, gRes, sRes] = await Promise.all([
        axios.get(`${API}/threats`).catch(() => ({ data: [] })),
        axios.get(`${API}/alerts`).catch(() => ({ data: [] })),
        axios.get(`${API}/graph`).catch(() => ({ data: null })),
        axios.get(`${API}/stats`).catch(() => ({ data: {} })),
      ]);
      if (Array.isArray(tRes.data))   setThreats(tRes.data);
      if (Array.isArray(aRes.data))   setAlerts(aRes.data);
      if (gRes.data && gRes.data.nodes) setGraphData(gRes.data);
      if (sRes.data)                  setStats(sRes.data);

      setPipeline(prev => ({
        ...prev,
        api:   true,
        spark: (tRes.data?.length ?? 0) > 0,
        flink: (aRes.data?.length ?? 0) > 0,
        graphx: !!(gRes.data?.nodes?.length),
        kafka: (tRes.data?.length ?? 0) > 0,
      }));
    } catch {
      setPipeline(prev => ({ ...prev, api: false }));
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    poll();
    pollRef.current = setInterval(poll, 2500);
  }, [poll]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // ── WebSocket with polling fallback ────────────────────────────────────
  const connectWS = useCallback(() => {
    try {
      const ws = new WebSocket(WS);
      wsRef.current = ws;

      ws.onopen = () => {
        wsAliveRef.current = true;
        stopPolling();
        setPipeline(prev => ({ ...prev, api: true }));
      };

      ws.onmessage = ({ data }) => {
        try {
          const d = JSON.parse(data);
          if (Array.isArray(d.threats))  setThreats(d.threats);
          if (Array.isArray(d.alerts))   setAlerts(d.alerts);
          if (d.graphData?.nodes)        setGraphData(d.graphData);
          if (d.stats)                   setStats(d.stats);
          setPipeline(prev => ({
            ...prev,
            api:   true,
            spark: (d.threats?.length ?? 0) > 0,
            flink: (d.alerts?.length  ?? 0) > 0,
            graphx: !!(d.graphData?.nodes?.length),
            kafka: (d.threats?.length ?? 0) > 0,
          }));
        } catch { /* ignore malformed frames */ }
      };

      ws.onerror = () => {
        wsAliveRef.current = false;
        startPolling();
      };

      ws.onclose = () => {
        wsAliveRef.current = false;
        setPipeline(prev => ({ ...prev, api: false }));
        startPolling();
        setTimeout(connectWS, 5000);
      };
    } catch {
      startPolling();
    }
  }, [startPolling, stopPolling]);

  useEffect(() => {
    connectWS();
    return () => {
      wsRef.current?.close();
      stopPolling();
    };
  }, [connectWS, stopPolling]);

  return (
    <div className="min-h-screen bg-darkBg text-slate-200 overflow-x-hidden relative">

      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-15%] left-[-5%]  w-[45%] h-[45%] bg-blue-900/10  blur-[140px] rounded-full" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[40%] h-[40%] bg-red-900/10   blur-[120px] rounded-full" />
        <div className="absolute top-[40%] left-[40%]  w-[30%] h-[30%] bg-purple-900/10 blur-[100px] rounded-full" />
      </div>

      <Header pipeline={pipeline} stats={stats} />

      <main className="px-5 pb-8 relative z-10 max-w-[1920px] mx-auto space-y-5">

        {/* ── Stat cards ─────────────────────────────────────────── */}
        <motion.div {...fade(0.05)}>
          <StatsCards threats={threats} alerts={alerts} stats={stats} />
        </motion.div>

        {/* ── Row 1: Map (2col) | Alert Feed (1col) | Network Graph (1col) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <motion.div className="xl:col-span-2" {...fade(0.1)}>
            <AttackMap threats={threats} />
          </motion.div>
          <motion.div {...fade(0.15)}>
            <AlertFeed alerts={alerts} />
          </motion.div>
          <motion.div {...fade(0.2)}>
            <NetworkGraph threats={threats} graphData={graphData} />
          </motion.div>
        </div>

        {/* ── Row 2: Timeline | Chart | Top Attackers | Live Feed ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <motion.div {...fade(0.25)}>
            <ThreatTimeline threats={threats} />
          </motion.div>
          <motion.div {...fade(0.3)}>
            <ThreatChart threats={threats} />
          </motion.div>
          <motion.div {...fade(0.35)}>
            <TopAttackers threats={threats} graphData={graphData} />
          </motion.div>
          <motion.div {...fade(0.4)}>
            <ThreatFeed threats={threats} />
          </motion.div>
        </div>

      </main>
    </div>
  );
}
