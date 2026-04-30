import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Shield, Wifi, AlertTriangle } from 'lucide-react';

const PATTERN_META = {
  BRUTE_FORCE: { label: 'Brute Force',  icon: Shield,        color: 'critical', border: 'border-critical', bg: 'bg-critical/8'  },
  PORT_SCAN:   { label: 'Port Scan',    icon: Wifi,          color: 'high',     border: 'border-high',     bg: 'bg-high/8'      },
  DDOS:        { label: 'DDoS Burst',   icon: Zap,           color: 'critical', border: 'border-critical', bg: 'bg-critical/10' },
  DEFAULT:     { label: 'Alert',        icon: AlertTriangle, color: 'medium',   border: 'border-medium',   bg: 'bg-medium/8'    },
};

const SEV_BADGE = {
  CRITICAL: 'badge-critical',
  HIGH:     'badge-high',
  MEDIUM:   'badge-medium',
  LOW:      'badge-low',
};

function AlertItem({ alert, index }) {
  const meta  = PATTERN_META[alert.pattern] ?? PATTERN_META.DEFAULT;
  const Icon  = meta.icon;
  const badge = SEV_BADGE[alert.severity] ?? 'badge-low';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28, delay: index * 0.03 }}
      className={`p-3 rounded-xl border-l-2 ${meta.border} ${meta.bg} space-y-1.5`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`w-3.5 h-3.5 text-${meta.color} shrink-0`} />
          <span className={`text-${meta.color} text-[11px] font-bold uppercase tracking-wider truncate`}>
            {meta.label}
          </span>
        </div>
        <span className={badge}>{alert.severity}</span>
      </div>

      {/* Description */}
      <p className="text-slate-300 text-[11px] leading-relaxed font-mono">
        {alert.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-600 font-mono">
        <span>{alert.src_country} → {alert.dst_country}</span>
        <span>{alert.timestamp?.slice(11)}</span>
      </div>
    </motion.div>
  );
}

export default function AlertFeed({ alerts = [] }) {
  const sorted = [...alerts].reverse();

  return (
    <div className="glass-panel p-4 h-[420px] flex flex-col border-l-2 border-critical/40">
      <div className="panel-title">
        <Zap className="w-3.5 h-3.5 text-critical" />
        Flink CEP Alerts
        {alerts.length > 0 && (
          <span className="ml-auto bg-critical/20 text-critical text-[10px] font-bold px-2 py-0.5 rounded-full">
            {alerts.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        <AnimatePresence mode="popLayout">
          {sorted.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-40 gap-3 text-slate-600"
            >
              <Zap className="w-8 h-8 opacity-30" />
              <p className="text-[11px] font-mono tracking-wider animate-pulse">
                Awaiting pattern detection…
              </p>
              <p className="text-[10px] text-slate-700">Start flink_cep.py</p>
            </motion.div>
          ) : (
            sorted.map((a, i) => (
              <AlertItem key={a.id ?? i} alert={a} index={i} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer legend */}
      <div className="mt-3 pt-2 border-t border-white/10 grid grid-cols-3 gap-1 text-[9px] text-slate-600 font-mono">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-critical" />Brute Force</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-high" />Port Scan</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-critical" />DDoS</span>
      </div>
    </div>
  );
}
