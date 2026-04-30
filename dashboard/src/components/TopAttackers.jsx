import { useMemo } from 'react';
import { Target } from 'lucide-react';

const LEVEL_STYLE = {
  CRITICAL: 'badge-critical',
  HIGH:     'badge-high',
  MEDIUM:   'badge-medium',
  LOW:      'badge-low',
};

function PageRankBar({ value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-full bg-white/5 rounded-full h-1 mt-1">
      <div className="h-1 rounded-full bg-graphPurple transition-all duration-700"
        style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function TopAttackers({ threats = [], graphData = null }) {
  const { rows, maxPR } = useMemo(() => {
    // Build IP counts from live threats
    const counts = {}, levels = {}, types = {}, countries = {};
    threats.forEach(t => {
      if (!t.ip) return;
      counts[t.ip]    = (counts[t.ip] ?? 0) + 1;
      levels[t.ip]    = t.threat_level;
      types[t.ip]     = t.attack_type;
      countries[t.ip] = t.src_country;
    });

    // Merge PageRank from GraphX if available
    const prMap = {};
    if (graphData?.top_attackers) {
      graphData.top_attackers.forEach(a => { prMap[a.ip] = a.pagerank ?? 0; });
    }

    const rows = Object.entries(counts)
      .map(([ip, count]) => ({
        ip, count, level: levels[ip], type: types[ip],
        country: countries[ip], pagerank: prMap[ip] ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const maxPR = Math.max(...rows.map(r => r.pagerank), 0.01);
    return { rows, maxPR };
  }, [threats, graphData]);

  return (
    <div className="glass-panel p-4 h-[300px] flex flex-col">
      <div className="panel-title">
        <Target className="w-3.5 h-3.5 text-critical" />
        Top Attackers
        <span className="ml-auto text-slate-600 font-normal normal-case tracking-normal text-[10px]">
          by frequency · GraphX PageRank
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-600">
            <p className="text-[11px] font-mono animate-pulse">Scanning…</p>
          </div>
        ) : (
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-slate-600 text-[9px] uppercase tracking-[0.15em] border-b border-white/10">
                <th className="pb-2 pl-1">IP Address</th>
                <th className="pb-2">Hits</th>
                <th className="pb-2">Level</th>
                <th className="pb-2 pr-1">PR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ip}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                  <td className="py-2 pl-1">
                    <div className="text-neonCyan text-[10px] font-bold group-hover:text-white transition-colors truncate max-w-[110px]">
                      {r.ip}
                    </div>
                    <div className="text-slate-600 text-[9px]">{r.country}</div>
                  </td>
                  <td className="py-2 text-slate-200 font-black text-[11px]">{r.count}</td>
                  <td className="py-2">
                    <span className={LEVEL_STYLE[r.level] ?? 'badge-low'}>{r.level}</span>
                  </td>
                  <td className="py-2 pr-1 w-14">
                    <div className="text-graphPurple text-[9px]">{(r.pagerank * 100).toFixed(0)}%</div>
                    <PageRankBar value={r.pagerank} max={maxPR} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
