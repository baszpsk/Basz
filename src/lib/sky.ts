// The background sky follows the real time of day in Bangkok: dawn, day,
// dusk, night. Colors are set as CSS variables on :root.

type Stop = [number, string, string, string];
// [minute of day, top, middle, glow]
const STOPS: Stop[] = [
  [0, '#060913', '#0d1633', '#2a2466'],
  [330, '#0b1230', '#2c2a5e', '#b0577a'],
  [400, '#23325f', '#e0826b', '#ffc98b'],
  [480, '#2f6fd1', '#7cc3ff', '#ffe2a8'],
  [720, '#1d73de', '#53b5ff', '#aef0ff'],
  [930, '#2a5ec6', '#f0a765', '#ffd9a0'],
  [1065, '#2b1f5c', '#df5f7c', '#ffa56b'],
  [1150, '#101a3d', '#322f7a', '#7a4aa0'],
  [1290, '#070b18', '#10183a', '#3a2f78'],
  [1440, '#060913', '#0d1633', '#2a2466'],
];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};

export function skyAt(minute: number) {
  const m = ((minute % 1440) + 1440) % 1440;
  let i = 0;
  while (i < STOPS.length - 1 && STOPS[i + 1][0] <= m) i++;
  const a = STOPS[i];
  const b = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const t = b[0] === a[0] ? 0 : (m - a[0]) / (b[0] - a[0]);
  return { top: mix(a[1], b[1], t), mid: mix(a[2], b[2], t), glow: mix(a[3], b[3], t) };
}

export function paintSky(now = new Date()) {
  const s = skyAt(now.getHours() * 60 + now.getMinutes());
  const r = document.documentElement.style;
  r.setProperty('--sky-top', s.top);
  r.setProperty('--sky-mid', s.mid);
  r.setProperty('--sky-glow', s.glow);
}
