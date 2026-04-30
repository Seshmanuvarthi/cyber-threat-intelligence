import { useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';

const FLAGS = {
  London: '🇬🇧', UK: '🇬🇧', Singapore: '🇸🇬', USA: '🇺🇸',
  Russia: '🇷🇺', China: '🇨🇳', India: '🇮🇳', Brazil: '🇧🇷',
};

const W = 600, H = 460;
const CX = W / 2, CY = H / 2 + 10;
const RING_R = 170;   // radius of the node ring

// Place nodes evenly on a circle, biggest attacker at top
function circularLayout(nodes) {
  const sorted = [...nodes].sort((a, b) => (b.threats_sent ?? 0) - (a.threats_sent ?? 0));
  const pos = {};
  sorted.forEach((node, i) => {
    const angle = (2 * Math.PI * i / sorted.length) - Math.PI / 2;
    pos[node.id] = {
      x:     CX + RING_R * Math.cos(angle),
      y:     CY + RING_R * Math.sin(angle),
      angle,
      // Label sits further outside the ring
      lx: CX + (RING_R + 38) * Math.cos(angle),
      ly: CY + (RING_R + 38) * Math.sin(angle),
    };
  });
  return pos;
}

// Quadratic bezier arced to the LEFT of the source→target direction
// (so reverse edges arc the opposite way — two distinct arcs per pair)
function arcPath(ax, ay, bx, by, curvePx = 22) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax,       dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cpx = mx - (dy / len) * curvePx;
  const cpy = my + (dx / len) * curvePx;
  return `M${ax.toFixed(1)},${ay.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
}

// Move point (tx,ty) dist pixels toward (fx,fy) — shortens edge ends off node circles
function approach(fx, fy, tx, ty, dist) {
  const dx = tx - fx, dy = ty - fy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return [tx - (dx / len) * dist, ty - (dy / len) * dist];
}

function nodeStyle(node) {
  const s = node.threats_sent ?? 0, r = node.threats_received ?? 0;
  const ratio = s / (s + r + 1);
  if (ratio > 0.55) return { fill: 'rgba(255,23,68,0.22)',  stroke: '#ff1744', role: 'Attacker' };
  if (ratio < 0.45) return { fill: 'rgba(0,180,216,0.22)', stroke: '#00b4d8', role: 'Target'   };
  return                   { fill: 'rgba(124,58,237,0.22)', stroke: '#7c3aed', role: 'Both'     };
}

function anchor(angle) {
  const c = Math.cos(angle);
  if (c >  0.25) return 'start';
  if (c < -0.25) return 'end';
  return 'middle';
}

export default function NetworkGraph({ threats = [], graphData = null }) {
  const [hovered, setHovered] = useState(null);

  const { nodes, edges } = useMemo(() => {
    if (graphData?.nodes?.length && graphData?.edges?.length) {
      return { nodes: graphData.nodes, edges: graphData.edges };
    }
    const nm = {}, em = {};
    threats.forEach(t => {
      const { src_country: s, dst_country: d } = t;
      if (!s || !d || s === d) return;
      if (!nm[s]) nm[s] = { id: s, threats_sent: 0, threats_received: 0, pagerank: 0.1 };
      if (!nm[d]) nm[d] = { id: d, threats_sent: 0, threats_received: 0, pagerank: 0.1 };
      nm[s].threats_sent++;
      nm[d].threats_received++;
      const k = `${s}→${d}`;
      if (!em[k]) em[k] = { source: s, target: d, weight: 0 };
      em[k].weight++;
    });
    const ns = Object.values(nm);
    const mx = Math.max(...ns.map(n => n.threats_sent), 1);
    ns.forEach(n => { n.pagerank = n.threats_sent / mx; });
    return { nodes: ns, edges: Object.values(em) };
  }, [threats, graphData]);

  const pos    = useMemo(() => circularLayout(nodes), [nodes]);
  const maxPR  = Math.max(...nodes.map(n => n.pagerank ?? 0.1), 0.1);
  const maxWt  = Math.max(...edges.map(e => e.weight), 1);
  const hovNode = nodes.find(n => n.id === hovered);

  return (
    <div className="glass-panel p-4 h-[520px] flex flex-col border-l-2 border-graphPurple/40">
      {/* Header */}
      <div className="panel-title">
        <Share2 className="w-3.5 h-3.5 text-graphPurple" />
        GraphX Threat Network
        <span className="ml-auto text-slate-600 font-normal normal-case tracking-normal text-[10px]">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      {nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
          <Share2 className="w-8 h-8 opacity-25" />
          <p className="text-[11px] font-mono animate-pulse">Building graph…</p>
          <p className="text-[10px] text-slate-700">Run graphx_analysis.py</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden relative">

          {/* ── HTML hover tooltip — real CSS pixels, always readable ── */}
          {hovNode && (() => {
            const { stroke, role } = nodeStyle(hovNode);
            const roleColor = stroke;
            return (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="rounded-xl px-5 py-4 min-w-[160px] text-center"
                  style={{ background: '#07101e', border: `2px solid ${roleColor}`, boxShadow: `0 0 24px ${roleColor}44` }}>
                  <div className="text-xl font-black font-mono text-slate-100 leading-tight">
                    {FLAGS[hovNode.id] ?? ''} {hovNode.id}
                  </div>
                  <div className="text-sm font-bold font-mono mt-1" style={{ color: roleColor }}>
                    {role}
                  </div>
                  <div className="my-2 border-t" style={{ borderColor: roleColor + '44' }} />
                  <div className="text-sm font-mono text-slate-400 leading-6">
                    <span className="text-slate-300">↑ Sent</span> {hovNode.threats_sent ?? 0}
                  </div>
                  <div className="text-sm font-mono text-slate-400 leading-6">
                    <span className="text-slate-300">↓ Rcvd</span> {hovNode.threats_received ?? 0}
                  </div>
                  <div className="mt-2 text-sm font-bold font-mono" style={{ color: roleColor }}>
                    PageRank {((hovNode.pagerank ?? 0) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            );
          })()}

          <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
            <defs>
              <marker id="arr" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto">
                <path d="M0,0.5 L0,5.5 L5.5,3 z" fill="#7c3aed" fillOpacity="0.75" />
              </marker>
              <marker id="arrH" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto">
                <path d="M0,0.5 L0,5.5 L5.5,3 z" fill="#a78bfa" />
              </marker>
            </defs>

            {/* ── Edges ─────────────────────────────── */}
            {edges.map((e, i) => {
              const a = pos[e.source], b = pos[e.target];
              if (!a || !b) return null;

              const prT = (nodes.find(n => n.id === e.target)?.pagerank ?? 0.1) / maxPR;
              const rT  = 16 + prT * 9;  // target node radius
              const rS  = 12;            // source shrink

              const [ex, ey] = approach(a.x, a.y, b.x, b.y, rT + 6);
              const [sx, sy] = approach(b.x, b.y, a.x, a.y, rS);
              const d        = arcPath(sx, sy, ex, ey, 20);

              const isHov = hovered === e.source || hovered === e.target;
              const op    = isHov ? 0.95 : 0.10 + (e.weight / maxWt) * 0.50;
              const sw    = isHov ? 2.2  : 0.7  + (e.weight / maxWt) * 1.8;

              return (
                <path key={i} d={d} fill="none"
                  stroke={isHov ? '#a78bfa' : '#7c3aed'}
                  strokeWidth={sw} strokeOpacity={op}
                  markerEnd={isHov ? 'url(#arrH)' : 'url(#arr)'}
                  style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }}
                />
              );
            })}

            {/* ── Nodes ─────────────────────────────── */}
            {nodes.map(node => {
              const p = pos[node.id];
              if (!p) return null;
              const pr   = (node.pagerank ?? 0.1) / maxPR;
              const r    = 16 + pr * 9;                 // 16–25px
              const { fill, stroke } = nodeStyle(node);
              const isHov = hovered === node.id;
              const ta    = anchor(p.angle);

              return (
                <g key={node.id}
                   onMouseEnter={() => setHovered(node.id)}
                   onMouseLeave={() => setHovered(null)}
                   style={{ cursor: 'pointer' }}>

                  {/* Glow ring */}
                  {isHov && (
                    <circle cx={p.x} cy={p.y} r={r + 9}
                      fill="none" stroke={stroke} strokeWidth={1.5} strokeOpacity={0.35} />
                  )}

                  {/* Node circle */}
                  <circle cx={p.x} cy={p.y} r={r}
                    fill={fill} stroke={stroke}
                    strokeWidth={isHov ? 2.8 : 1.8}
                    style={{ transition: 'all 0.15s' }} />

                  {/* Flag */}
                  <text x={p.x} y={p.y + 1}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={r * 0.95}
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {FLAGS[node.id] ?? node.id.slice(0, 2)}
                  </text>

                  {/* Country name — outside ring */}
                  <text x={p.lx} y={p.ly}
                    textAnchor={ta} dominantBaseline="middle"
                    fontSize={11} fontFamily="monospace"
                    fill={isHov ? '#f1f5f9' : '#94a3b8'}
                    style={{ userSelect: 'none', pointerEvents: 'none', transition: 'fill 0.15s' }}>
                    {node.id}
                  </text>

                  {/* PageRank % on hover */}
                  {isHov && (
                    <text x={p.lx} y={p.ly + 16}
                      textAnchor={ta} fontSize={11} fontFamily="monospace" fontWeight="bold"
                      fill={stroke}
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      PR {((node.pagerank ?? 0) * 100).toFixed(0)}%
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── Centre hint (when nothing hovered) ── */}
            {!hovNode && (
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
                fontSize={18} fill="#1e2a3a" fontFamily="monospace">
                hover a node
              </text>
            )}
          </svg>
        </div>
      )}

      {/* Legend */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-500 font-mono flex-wrap gap-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-critical/70" />Attacker</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neonCyan/70" />Target</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-graphPurple/70" />Both</span>
        <span className="text-slate-700">Node size = PageRank · Arrow = attack flow</span>
      </div>
    </div>
  );
}
