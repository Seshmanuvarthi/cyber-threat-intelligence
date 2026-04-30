import { useMemo, Fragment } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const COORDS = {
  "London":    [51.5074,  -0.1278],
  "UK":        [55.3781,  -3.4360],
  "Singapore": [ 1.3521, 103.8198],
  "USA":       [37.0902,  -95.7129],
  "China":     [35.8617,  104.1954],
  "Russia":    [61.5240,  105.3188],
  "Brazil":    [-14.235,  -51.9253],
  "India":     [20.5937,   78.9629],
};

const LEVEL_COLOR = {
  CRITICAL: '#ff1744',
  HIGH:     '#ff6d00',
  MEDIUM:   '#ffd600',
  LOW:      '#00e676',
};

function bezier(src, dst, pts = 40) {
  const [la1, ln1] = src, [la2, ln2] = dst;
  const midLa = (la1 + la2) / 2;
  const midLn = (ln1 + ln2) / 2;
  const arc   = Math.abs(ln2 - ln1) * 0.22;
  const out   = [];
  for (let i = 0; i <= pts; i++) {
    const t = i / pts;
    out.push([
      (1-t)**2 * la1 + 2*(1-t)*t * (midLa + arc) + t**2 * la2,
      (1-t)**2 * ln1 + 2*(1-t)*t *  midLn          + t**2 * ln2,
    ]);
  }
  return out;
}

export default function AttackMap({ threats = [] }) {
  const vectors = useMemo(() => {
    // Show last 30 threats; only last 8 draw animated arcs
    const slice = threats.slice(-30);
    return slice.map((t, idx) => {
      const jLa = (Math.random() - 0.5) * 1.8;
      const jLn = (Math.random() - 0.5) * 1.8;
      const src = (COORDS[t.src_country] ?? [20, 0]).map((v, i) => v + (i === 0 ? jLa : jLn));
      const dst = (COORDS[t.dst_country] ?? [20, 0]).map((v, i) => v + (i === 0 ? jLa : jLn));
      return { ...t, src, dst, curve: bezier(src, dst), id: idx, active: idx >= slice.length - 8 };
    });
  }, [threats]);

  const lvlColor = (lv) => LEVEL_COLOR[lv] ?? '#94a3b8';

  return (
    <div className="glass-panel p-4 h-[420px] flex flex-col">
      <div className="panel-title">
        <span className="w-2 h-2 rounded-full bg-critical status-dot-live" />
        Global Attack Map
        <span className="ml-auto text-slate-600 font-normal normal-case tracking-normal text-[10px]">
          {threats.length} total events · showing last 30
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-2 text-[10px] font-mono">
        {Object.entries(LEVEL_COLOR).map(([lv, c]) => (
          <span key={lv} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: c }} />
            <span style={{ color: c }}>{lv}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 ml-2">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          <span className="text-purple-400">Source</span>
        </span>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden border border-white/5 relative z-0">
        <MapContainer center={[20, 10]} zoom={2} style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false} attributionControl={false} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {vectors.map(vec => (
            <Fragment key={vec.id}>
              {/* Attack arc — only for recent active events */}
              {vec.active && (
                <Polyline positions={vec.curve} pathOptions={{
                  color: lvlColor(vec.threat_level),
                  weight: vec.threat_level === 'CRITICAL' ? 2.5 : 1.5,
                  opacity: 0.85,
                  dashArray: '6 10',
                }} />
              )}

              {/* Source (attacker) — purple */}
              <CircleMarker center={vec.src} radius={vec.active ? 5 : 3}
                fillOpacity={vec.active ? 0.9 : 0.25} stroke={false} fillColor="#a855f7">
                <Tooltip className="!bg-[#0a1020] !text-slate-100 !border-white/10 !rounded-lg !text-xs !font-mono !p-2">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Source</p>
                    <p className="text-purple-400 font-bold">{vec.src_country}</p>
                    <p className="text-slate-400">{vec.ip}</p>
                  </div>
                </Tooltip>
              </CircleMarker>

              {/* Target — color by severity */}
              <CircleMarker center={vec.dst}
                radius={vec.active ? (vec.threat_level === 'CRITICAL' ? 8 : 6) : 3}
                fillOpacity={vec.active ? 0.85 : 0.2}
                stroke={vec.active} color={lvlColor(vec.threat_level)} weight={1.5}
                fillColor={lvlColor(vec.threat_level)}>
                <Tooltip className="!bg-[#0a1020] !text-slate-100 !border-white/10 !rounded-lg !text-xs !font-mono !p-2">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Target</p>
                    <p style={{ color: lvlColor(vec.threat_level) }} className="font-bold">{vec.dst_country}</p>
                    <p className="text-slate-300">{vec.attack_type}</p>
                    <span className={`badge-${(vec.threat_level ?? 'low').toLowerCase()}`}>{vec.threat_level}</span>
                  </div>
                </Tooltip>
              </CircleMarker>
            </Fragment>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
