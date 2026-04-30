import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts';
import { BarChart2 } from 'lucide-react';

const ATTACK_COLORS = {
  'TLS Exploit':        '#ff1744',
  'Brute Force':        '#ff6d00',
  'HTTP Injection':     '#ffd600',
  'Port Scan':          '#00b4d8',
  'Blockchain Exploit': '#7c3aed',
  'Recon Probe':        '#00e676',
  'Network Probe':      '#475569',
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, count, color } = payload[0].payload;
  return (
    <div className="bg-[#0a1020] border border-white/10 rounded-xl p-3 font-mono text-[11px] shadow-glowPanel">
      <p style={{ color }} className="font-bold mb-1">{name}</p>
      <p className="text-slate-300">Events: <span className="font-black text-white">{count}</span></p>
    </div>
  );
};

export default function ThreatChart({ threats = [] }) {
  const chartData = useMemo(() => {
    const counts = {};
    threats.forEach(t => {
      const k = t.attack_type ?? 'Unknown';
      counts[k] = (counts[k] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, color: ATTACK_COLORS[name] ?? '#94a3b8' }))
      .sort((a, b) => b.count - a.count);
  }, [threats]);

  return (
    <div className="glass-panel p-4 h-[300px] flex flex-col">
      <div className="panel-title">
        <BarChart2 className="w-3.5 h-3.5 text-high" />
        Attack Distribution
        <span className="ml-auto text-slate-600 font-normal normal-case tracking-normal text-[10px]">
          {chartData.length} types detected
        </span>
      </div>

      {chartData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-600">
          <p className="text-[11px] font-mono animate-pulse">Classifying events…</p>
        </div>
      ) : (
        <div className="flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 18, right: 8, left: -24, bottom: 0 }}
              barCategoryGap="28%">
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="name" stroke="#334155"
                tick={{ fill: '#475569', fontSize: 8, fontFamily: 'monospace' }}
                axisLine={false} tickLine={false} interval={0}
                angle={-20} textAnchor="end" height={36} />
              <YAxis stroke="#334155"
                tick={{ fill: '#475569', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" maxBarSize={48}
                shape={(props) => {
                  const { x, y, width, height, index } = props;
                  const color = chartData[index]?.color ?? '#94a3b8';
                  return (
                    <rect x={x} y={y} width={width} height={Math.max(0, height)}
                      fill={color} fillOpacity={0.85} rx={5} ry={5} />
                  );
                }}
              >
                <LabelList dataKey="count" position="top"
                  style={{ fill: '#94a3b8', fontSize: 9, fontFamily: 'monospace' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
