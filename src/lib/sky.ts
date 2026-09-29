// The background is a bright color field that follows the time of day in
// Bangkok: warm at dawn, fresh in the morning, clear at midday, golden in
// the afternoon, rosy in the evening, soft lilac at night. Four blob colors
// are set as CSS variables on :root and mixed smoothly between stops.

type Stop = [number, string, string, string, string];
// [minute of day, blob 1, blob 2, blob 3, blob 4]
const STOPS: Stop[] = [
  [0, '#a78bfa', '#7f9cff', '#f59ad0', '#5fd4d0'],
  [300, '#a78bfa', '#7f9cff', '#f59ad0', '#5fd4d0'],
  [390, '#ffb38a', '#ffe27a', '#ff8fb1', '#8fd3ff'],
  [540, '#6cc6ff', '#ffe066', '#5ee0b8', '#ffb38a'],
  [780, '#4dd4ff', '#ffe066', '#43e0a8', '#8ea8ff'],
  [990, '#ffae5c', '#ffd84d', '#ff7eb3', '#7cc8ff'],
  [1140, '#ff8a7a', '#b49cff', '#ff85c0', '#7fb8ff'],
  [1290, '#a78bfa', '#7f9cff', '#f59ad0', '#5fd4d0'],
  [1440, '#a78bfa', '#7f9cff', '#f59ad0', '#5fd4d0'],
];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};

export function skyAt(minute: number): string[] {
  const m = ((minute % 1440) + 1440) % 1440;
  let i = 0;
  while (i < STOPS.length - 1 && STOPS[i + 1][0] <= m) i++;
  const a = STOPS[i];
  const b = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const t = b[0] === a[0] ? 0 : (m - a[0]) / (b[0] - a[0]);
  return [1, 2, 3, 4].map((k) => mix(a[k] as string, b[k] as string, t));
}

export function paintSky(now = new Date()) {
  const colors = skyAt(now.getHours() * 60 + now.getMinutes());
  const r = document.documentElement.style;
  colors.forEach((c, i) => r.setProperty(`--b${i + 1}`, c));
}
