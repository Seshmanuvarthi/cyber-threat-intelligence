import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Zap, GitMerge, Share2, Activity } from 'lucide-react';

const SERVICE = [
  { key: 'kafka', label: 'Kafka',  icon: Zap,        color: 'text-neonCyan',   glow: 'shadow-glowCyan'   },
  { key: 'spark', label: 'Spark',  icon: Activity,   color: 'text-high',       glow: 'shadow-glowOrange' },
  { key: 'flink', label: 'Flink',  icon: GitMerge,   color: 'text-medium',     glow: 'shadow-glowYellow' },
  { key: 'graphx',label: 'GraphX', icon: Share2,      color: 'text-graphPurple',glow: 'shadow-glowPurple' },
];

export default function Header({ pipeline = {}, stats = {} }) {
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const isLive = pipeline.api && pipeline.spark;

  return (
    <header className="sticky top-0 z-50 bg-[rgba(5,8,16,0.92)] backdrop-blur-2xl border-b border-white/10 shadow-glowPanel">
      <div className="max-w-[1920px] mx-auto px-5 py-3 flex items-center justify-between gap-4">

        {/* ── Left: Brand ─────────────────────────────────────── */}
        <div className="flex items-center gap-3 min-w-0">
          <motion.div
            animate={{ opacity: [1, 0.5, 1], scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          >
            <ShieldAlert className="text-critical w-8 h-8 drop-shadow-[0_0_14px_rgba(255,23,68,0.9)] shrink-0" />
          </motion.div>
          <div className="leading-tight">
            <h1 className="text-base font-black tracking-[0.18em] text-slate-100 uppercase whitespace-nowrap">
              Cyber Threat <span className="text-critical drop-shadow-[0_0_8px_rgba(255,23,68,0.5)]">Intelligence</span>
            </h1>
            <p className="text-[10px] text-slate-500 tracking-widest uppercase">
              Command Center · BDA Pipeline
            </p>
          </div>
        </div>

        {/* ── Centre: Pipeline status chips ───────────────────── */}
        <div className="hidden md:flex items-center gap-2 flex-wrap justify-center">
          {SERVICE.map(({ key, label, icon: Icon, color, glow }) => {
            const active = !!pipeline[key];
            return (
              <div
                key={key}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all duration-500 ${
                  active
                    ? `bg-white/5 border-white/15 ${color} ${glow}`
                    : 'bg-transparent border-white/10 text-slate-600'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    active ? 'bg-current status-dot-live' : 'bg-slate-700'
                  }`}
                />
                <Icon className="w-3.5 h-3.5" />
                {label}
              </div>
            );
          })}
        </div>

        {/* ── Right: Live indicator + clock ───────────────────── */}
        <div className="flex items-center gap-4 shrink-0">
          {isLive && (
            <div className="flex items-center gap-2 bg-critical/10 border border-critical/30 px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-critical status-dot-live" />
              <span className="text-critical text-[11px] font-bold tracking-widest uppercase">
                Live · {stats.total ?? 0} events
              </span>
            </div>
          )}
          <div className="text-neonCyan font-mono tracking-widest text-lg drop-shadow-[0_0_6px_rgba(0,180,216,0.5)]">
            {time}
          </div>
        </div>

      </div>
    </header>
  );
}
