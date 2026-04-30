import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldAlert, Shield, Users, AlertTriangle } from 'lucide-react';

function Card({ title, value, sub, icon: Icon, colorClass, borderClass, glowClass, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      className={`glass-panel p-5 flex items-center justify-between border-l-4 ${borderClass} ${glowClass} cursor-default`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">{title}</p>
        <p className={`text-2xl font-black font-mono leading-none ${colorClass} drop-shadow-[0_0_8px_currentColor]`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-[10px] text-slate-600 mt-1">{sub}</p>}
      </div>
      <Icon className={`${colorClass} w-8 h-8 opacity-70 shrink-0`} />
    </motion.div>
  );
}

export default function StatsCards({ threats = [], alerts = [] }) {
  const derived = useMemo(() => {
    const critical   = threats.filter(t => t.threat_level === 'CRITICAL').length;
    const high       = threats.filter(t => t.threat_level === 'HIGH').length;
    const medium     = threats.filter(t => t.threat_level === 'MEDIUM').length;
    const uniqueIps  = new Set(threats.map(t => t.ip).filter(Boolean)).size;
    const total      = threats.length;
    const alertCount = alerts.length;

    // Estimate attack rate: threats in last 60 seconds from timestamp field
    const now = Date.now();
    const recent = threats.filter(t => {
      if (!t.timestamp) return false;
      const ts = new Date(t.timestamp).getTime();
      return !isNaN(ts) && now - ts < 60_000;
    }).length;

    return { total, critical, high, medium, uniqueIps, alertCount, rate: recent };
  }, [threats, alerts]);

  const cards = [
    {
      title:       'Total Events',
      value:       derived.total,
      sub:         'Processed by Spark',
      icon:        Activity,
      colorClass:  'text-neonCyan',
      borderClass: 'border-neonCyan',
      glowClass:   'shadow-glowCyan',
    },
    {
      title:       'Critical',
      value:       derived.critical,
      sub:         'TLS Exploit · Blockchain',
      icon:        ShieldAlert,
      colorClass:  'text-critical',
      borderClass: 'border-critical',
      glowClass:   'shadow-glowCritical',
    },
    {
      title:       'High Severity',
      value:       derived.high,
      sub:         'Brute Force · HTTP Injection',
      icon:        ShieldAlert,
      colorClass:  'text-high',
      borderClass: 'border-high',
      glowClass:   'shadow-glowOrange',
    },
    {
      title:       'Medium',
      value:       derived.medium,
      sub:         'Port Scan · Recon',
      icon:        Shield,
      colorClass:  'text-medium',
      borderClass: 'border-medium',
      glowClass:   'shadow-glowYellow',
    },
    {
      title:       'Unique IPs',
      value:       derived.uniqueIps,
      sub:         'Active threat sources',
      icon:        Users,
      colorClass:  'text-graphPurple',
      borderClass: 'border-graphPurple',
      glowClass:   'shadow-glowPurple',
    },
    {
      title:       'CEP Alerts',
      value:       derived.alertCount,
      sub:         'Flink pattern detections',
      icon:        AlertTriangle,
      colorClass:  'text-low',
      borderClass: 'border-low',
      glowClass:   'shadow-glowGreen',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c, i) => <Card key={c.title} {...c} delay={i * 0.07} />)}
    </div>
  );
}
