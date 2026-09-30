// Small SVG charts: thin marks, rounded data-ends, hairline grid, a tooltip on
// hover/tap/focus, and text in ink tokens (never in the series color).
import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
};

/** Axis labels: whole numbers as they are, others to at most two decimals (a scale of 1 shows 0, 0.5, 1). */
const tick = (x: number) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(2)));

function Tip(props: { pct: number; value: string; label: string }) {
  const shift = props.pct < 18 ? '-12%' : props.pct > 82 ? '-88%' : '-50%';
  return (
    <div
      role="status"
      style={{
        position: 'absolute', left: props.pct + '%', top: '0px', transform: `translate(${shift}, -100%)`,
        padding: '6px 10px', borderRadius: '10px', background: 'var(--ground)', boxShadow: 'inset 0 0 0 1px var(--stroke), 0 8px 20px -8px var(--shadow)',
        pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center', zIndex: 2,
      }}
    >
      <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{props.value}</div>
      <div class="tiny">{props.label}</div>
    </div>
  );
}

/** Rounded top, square base. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface BarDatum { key: string; label: string; value: number }

export function BarChart(props: { data: BarDatum[]; height?: number; unit: string; tone?: string; title: string; labelLast?: boolean }) {
  const W = 340;
  const H = props.height || 120;
  const top = 16;
  const bottom = 18;
  const left = 28;
  const plotW = W - left - 4;
  const plotH = H - top - bottom;
  const max = niceMax(Math.max(...props.data.map((d) => d.value), 1));
  const slot = plotW / props.data.length;
  const bw = Math.min(24, slot - 2);
  const [hi, setHi] = useState<number | null>(null);
  const last = props.data.length - 1;
  return (
    <div style={{ position: 'relative' }}>
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${props.title}: ${props.data.map((d) => `${d.label} ${d.value} ${props.unit}`).join(', ')}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W} y1={top + plotH * (1 - f)} y2={top + plotH * (1 - f)} stroke="var(--stroke)" stroke-width="1" />
            <text x={left - 6} y={top + plotH * (1 - f) + 3} text-anchor="end">{tick(max * f)}</text>
          </g>
        ))}
        {props.data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const x = left + i * slot + (slot - bw) / 2;
          return (
            <g key={d.key}>
              <path d={barPath(x, top + plotH - h, bw, h)} fill={props.tone || 'var(--accent)'} opacity={hi === null || hi === i ? 1 : 0.45} />
              <rect
                x={left + i * slot}
                y={top}
                width={slot}
                height={plotH + bottom}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label}: ${d.value} ${props.unit}`}
                onPointerEnter={() => setHi(i)}
                onPointerLeave={() => setHi(null)}
                onFocus={() => setHi(i)}
                onBlur={() => setHi(null)}
                onClick={() => setHi(hi === i ? null : i)}
              />
              {(i === 0 || i === last || i === Math.floor(last / 2)) && (
                <text x={left + i * slot + slot / 2} y={H - 4} text-anchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
        {props.labelLast && props.data[last]?.value > 0 && hi === null && (
          <text x={left + last * slot + slot / 2} y={top + plotH - (props.data[last].value / max) * plotH - 5} text-anchor="middle" style={{ fill: 'var(--ink)', fontWeight: 700 } as JSX.CSSProperties}>
            {props.data[last].value}
          </text>
        )}
      </svg>
      {hi !== null && props.data[hi] && (
        <Tip pct={((left + hi * slot + slot / 2) / W) * 100} value={`${props.data[hi].value} ${props.unit}`} label={props.data[hi].label} />
      )}
    </div>
  );
}

/** 12-week calendar heatmap, one hue, darker = more. */
export function HeatMap(props: { data: { key: string; value: number }[]; unit: string; title: string; tone?: string }) {
  const weeks = Math.ceil(props.data.length / 7);
  const cell = 16;
  const gap = 3;
  const W = weeks * (cell + gap) + 18;
  const H = 7 * (cell + gap) + 2;
  const max = Math.max(...props.data.map((d) => d.value), 1);
  const [hi, setHi] = useState<number | null>(null);
  const firstWd = (() => {
    const [y, m, d] = (props.data[0]?.key || '2026-01-05').split('-').map(Number);
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
  })();
  const pos = (i: number) => {
    const idx = i + firstWd;
    return { x: 18 + Math.floor(idx / 7) * (cell + gap), y: (idx % 7) * (cell + gap) };
  };
  const level = (v: number) => (v <= 0 ? 0 : v < max * 0.25 ? 0.3 : v < max * 0.5 ? 0.5 : v < max * 0.75 ? 0.75 : 1);
  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg class="chart" viewBox={`0 0 ${W + (cell + gap)} ${H}`} style={{ maxWidth: `${(W + cell + gap) * 1.3}px` }} role="img" aria-label={props.title}>
        {['จ.', 'พ.', 'ศ.'].map((l, i) => (
          <text key={l} x={0} y={(i * 2) * (cell + gap) + cell - 4}>{l}</text>
        ))}
        {props.data.map((d, i) => {
          const p = pos(i);
          const lv = level(d.value);
          return (
            <rect
              key={d.key}
              x={p.x}
              y={p.y}
              width={cell}
              height={cell}
              rx={4}
              fill={lv ? props.tone || 'var(--accent)' : 'var(--fill-2)'}
              fill-opacity={lv || 1}
              stroke={hi === i ? 'var(--ink)' : 'none'}
              stroke-width={hi === i ? 1.5 : 0}
              tabIndex={0}
              aria-label={`${d.key}: ${Math.round(d.value)} ${props.unit}`}
              onPointerEnter={() => setHi(i)}
              onPointerLeave={() => setHi(null)}
              onFocus={() => setHi(i)}
              onBlur={() => setHi(null)}
              onClick={() => setHi(hi === i ? null : i)}
            />
          );
        })}
      </svg>
      {hi !== null && props.data[hi] && (
        <div class="tiny" style={{ marginTop: '6px' }}>
          <b class="num" style={{ color: 'var(--ink)' }}>{Math.round(props.data[hi].value)} {props.unit}</b> · {props.data[hi].key}
        </div>
      )}
    </div>
  );
}

export interface Series { name: string; color: string; points: { key: string; value: number | undefined }[] }

/** Two-series 0–10 line chart with legend, end labels, crosshair and a table view. */
export function LineChart(props: { series: Series[]; max: number; title: string; unit?: string }) {
  const W = 340;
  const H = 150;
  const top = 12;
  const bottom = 18;
  const left = 22;
  const right = 30;
  const n = props.series[0]?.points.length || 0;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => top + plotH * (1 - v / props.max);
  const [hi, setHi] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const paths = useMemo(
    () =>
      props.series.map((s) => {
        let d = '';
        let pen = false;
        s.points.forEach((p, i) => {
          if (p.value == null) {
            pen = false;
            return;
          }
          d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
          pen = true;
        });
        return d;
      }),
    [props.series],
  );
  const onMove = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - left) / plotW) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, i)));
  };
  const lastIdx = (s: Series) => {
    for (let i = s.points.length - 1; i >= 0; i--) if (s.points[i].value != null) return i;
    return -1;
  };
  return (
    <div class="stack-sm">
      <div class="row wrap" style={{ gap: '14px' }}>
        {props.series.map((s) => (
          <span key={s.name} class="row tiny" style={{ gap: '6px' }}>
            <svg width="16" height="4"><line x1="0" x2="16" y1="2" y2="2" stroke={s.color} stroke-width="2" stroke-linecap="round" /></svg>
            {s.name}
          </span>
        ))}
        <button class="chip" style={{ marginLeft: 'auto' }} onClick={() => setTable(!table)}>{table ? 'กราฟ' : 'ตาราง'}</button>
      </div>
      {table ? (
        <div style={{ overflowX: 'auto' }}>
          <table class="tiny num" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>วันที่</th>
                {props.series.map((s) => <th key={s.name} style={{ textAlign: 'right' }}>{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {props.series[0]?.points.map((p, i) => (
                <tr key={p.key}>
                  <td>{p.key}</td>
                  {props.series.map((s) => <td key={s.name} style={{ textAlign: 'right' }}>{s.points[i].value ?? '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.title} onPointerMove={onMove} onPointerLeave={() => setHi(null)} onPointerDown={onMove}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={left} x2={W - right} y1={y(props.max * f)} y2={y(props.max * f)} stroke="var(--stroke)" stroke-width="1" />
                <text x={left - 6} y={y(props.max * f) + 3} text-anchor="end">{props.max * f}</text>
              </g>
            ))}
            {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={top} y2={top + plotH} stroke="var(--ink-3)" stroke-width="1" />}
            {props.series.map((s, si) => (
              <path key={s.name} d={paths[si]} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            ))}
            {props.series.map((s) => {
              const li = lastIdx(s);
              if (li < 0) return null;
              const v = s.points[li].value as number;
              return (
                <g key={s.name}>
                  <circle cx={x(li)} cy={y(v)} r="4" fill={s.color} stroke="var(--ground)" stroke-width="2" />
                  <text x={x(li) + 8} y={y(v) + 3} style={{ fill: 'var(--ink-2)', fontWeight: 700 } as JSX.CSSProperties}>{v}</text>
                </g>
              );
            })}
            {n > 0 && (
              <>
                <text x={x(0)} y={H - 4} text-anchor="start">{props.series[0].points[0].key.slice(5)}</text>
                <text x={x(n - 1)} y={H - 4} text-anchor="end">{props.series[0].points[n - 1].key.slice(5)}</text>
              </>
            )}
          </svg>
          {hi !== null && (
            <div style={{ position: 'absolute', top: 0, left: `${(x(hi) / W) * 100}%`, transform: `translate(${hi > n / 2 ? '-105%' : '5%'}, 0)`, padding: '6px 10px', borderRadius: '10px', background: 'var(--ground)', boxShadow: 'inset 0 0 0 1px var(--stroke)', pointerEvents: 'none' }}>
              <div class="tiny">{props.series[0].points[hi].key}</div>
              {props.series.map((s) => (
                <div key={s.name} class="row" style={{ gap: '6px' }}>
                  <svg width="12" height="4"><line x1="0" x2="12" y1="2" y2="2" stroke={s.color} stroke-width="2" /></svg>
                  <b class="num">{s.points[hi].value ?? '–'}</b>
                  <span class="tiny">{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 12-point trend for a stat row: the line in the de-emphasis hue, today's value in the metric's color. */
export function Spark(props: { points: { key: string; value: number | undefined }[]; tone: string; label: string }) {
  const W = 72;
  const H = 30;
  const pad = 5;
  const vals = props.points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <svg width={W} height={H} aria-hidden="true" />;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const n = props.points.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
  const y = (v: number) => (hi === lo ? H / 2 : pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2));
  const idx = props.points.map((p, i) => (p.value == null ? -1 : i)).filter((i) => i >= 0);
  const d = idx.map((i, j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(props.points[i].value as number).toFixed(1)}`).join('');
  const last = idx[idx.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label} style={{ flex: 'none', overflow: 'visible' }}>
      <path d={d} fill="none" stroke="var(--ink-3)" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={x(last)} cy={y(props.points[last].value as number)} r="4" fill={props.tone} stroke="var(--ground)" stroke-width="2" />
    </svg>
  );
}
