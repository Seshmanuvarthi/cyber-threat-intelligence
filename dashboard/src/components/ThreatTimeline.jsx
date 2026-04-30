import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

const ATTACK_COLORS = {
  'TLS Exploit':       '#ff1744',
  'Brute Force':       '#ff6d00',
  'HTTP Injection':    '#ffd600',
  'Port Scan':         '#00b4d8',
  'Blockchain Exploit':'#7c3aed',
  'Recon Probe':       '#00e676',
  'Network Probe':     '#64748b',
};

function bucketMinute(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d)) return null;
  // "HH:MM" label
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a1020] border border-white/10 rounded-xl p-3 text-[11px] font-mono shadow-glowPanel">
      <p className="text-slate-400 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.dataKey}</span><span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function ThreatTimeline({ threats = [] }) {
  const { chartData, attackTypes } = useMemo(() => {
    // Bucket events by minute, track count per attack type
    const buckets = {};
    const types   = new Set();

    threats.forEach(t => {
      const bucket = bucketMinute(t.timestamp);
      if (!bucket) return;
      const type = t.attack_type ?? 'Unknown';
      types.add(type);
      if (!buckets[bucket]) buckets[bucket] = { time: bucket };
      buckets[bucket][type] = (buckets[bucket][type] ?? 0) + 1;
    });

    const sorted = Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time));
    // Keep last 20 buckets so the chart is readable
    const last20 = sorted.slice(-20);

    return { chartData: last20, attackTypes: [...types] };
  }, [threats]);

  const hasData = chartData.length > 0;

  return (
    <div className="glass-panel p-4 h-[300px] flex flex-col">
      <div className="panel-title">
        <TrendingUp className="w-3.5 h-3.5 text-neonCyan" />
        Attack Timeline
        <span className="ml-auto text-slate-600 font-normal normal-case tracking-normal text-[10px]">
          per minute · last {chartData.length} buckets
        </span>
      </div>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center text-slate-600">
          <p className="text-[11px] font-mono animate-pulse">Collecting data…</p>
        </div>
      ) : (
        <div className="flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 6" />
              <XAxis dataKey="time" stroke="#334155" tick={{ fill: '#475569', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#334155" tick={{ fill: '#475569', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace', paddingTop: 4 }} />
              {attackTypes.map(type => (
                <Line key={type} type="monotone" dataKey={type}
                  stroke={ATTACK_COLORS[type] ?? '#94a3b8'}
                  strokeWidth={1.5} dot={false} activeDot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
