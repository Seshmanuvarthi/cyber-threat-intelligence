import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';

const LEVEL_STYLE = {
  CRITICAL: { border: 'border-critical', text: 'text-critical', bg: 'bg-critical/6',  badge: 'badge-critical' },
  HIGH:     { border: 'border-high',     text: 'text-high',     bg: 'bg-high/6',      badge: 'badge-high'     },
  MEDIUM:   { border: 'border-medium',   text: 'text-medium',   bg: 'bg-medium/5',    badge: 'badge-medium'   },
  LOW:      { border: 'border-low',      text: 'text-low',      bg: 'bg-low/4',       badge: 'badge-low'      },
};

const PAYLOAD_LABEL = {
  TLS:       'TLS',
  JSONRPC:   'RPC',
  HTTP_POST: 'POST',
  HTTP_GET:  'GET',
  AUTH:      'AUTH',
};

export default function ThreatFeed({ threats = [] }) {
  const scrollRef = useRef(null);

  // Sort newest first by timestamp, fall back to array position
  const sorted = [...threats]
    .sort((a, b) => new Date(b.timestamp ?? 0) - new Date(a.timestamp ?? 0))
    .slice(0, 80);

  // Auto-scroll to top whenever new threats arrive
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [threats.length]);

  return (
    <div className="glass-panel p-4 h-[300px] flex flex-col border-l-2 border-neonCyan/30">
      <div className="panel-title">
        <Radio className="w-3.5 h-3.5 text-neonCyan" />
        Live Threat Feed
        {threats.length > 0 && (
          <span className="ml-auto bg-neonCyan/10 text-neonCyan text-[10px] font-bold px-2 py-0.5 rounded-full">
            {threats.length}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        <AnimatePresence mode="popLayout">
          {sorted.length === 0 ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-slate-600 font-mono text-[11px] px-1 pt-4 animate-pulse tracking-wider">
              Awaiting threat events…
            </motion.p>
          ) : (
            sorted.map((t, idx) => {
              const style = LEVEL_STYLE[t.threat_level] ?? LEVEL_STYLE.LOW;
              const pType = PAYLOAD_LABEL[t.payload_type] ?? t.service ?? '';
              return (
                <motion.div key={`${t.ip}-${t.timestamp}-${idx}`}
                  layout
                  initial={{ opacity: 0, x: -16, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                  className={`px-3 py-2 rounded-lg border-l-2 ${style.border} ${style.bg} font-mono`}
                >
                  {/* Row 1: attack type + severity + time */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text} truncate`}>
                        {t.attack_type}
                      </span>
                      {pType && (
                        <span className="text-[9px] bg-white/10 text-slate-500 px-1.5 py-0.5 rounded">
                          {pType}
                        </span>
                      )}
                    </div>
                    <span className={style.badge}>{t.threat_level}</span>
                  </div>

                  {/* Row 2: IP + vector */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">
                      <span className="text-slate-200 font-bold">{t.ip}</span>
                      {t.port && <span className="text-slate-600">:{t.port}</span>}
                    </span>
                    <span className="text-slate-600 truncate ml-2">
                      {t.src_country} → {t.dst_country}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
