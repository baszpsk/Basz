// "You vs your past self". Every metric is a daily series derived from the
// logs, compared with the last time it was recorded, with recent averages and
// with its all-time best. Nothing is stored here: history lasts as long as the
// logs do, and the numbers can never drift from what actually happened.

import { allItems, buildDay } from './schedule';
import { addDays } from './time';
import type { DayLog, Digest, MonthLog, Plan, Settings, Task } from './types';

export type Group = 'Day' | 'Sleep' | 'Body' | 'Health' | 'Seoulful';
/** Section headings for each group. */
export const GROUP_LABEL: Record<Group, string> = { Day: 'ประจำวัน', Sleep: 'การนอน', Body: 'ร่างกาย', Health: 'สุขภาพ', Seoulful: 'ร้าน Seoulful' };
export interface Point { key: string; value: number }

export interface Metric {
  id: string;
  group: Group;
  label: string;
  unit: string;
  better: 'up' | 'down';
  tone: string;
  decimals: number;
  /** Recorded values by logical day. Days without data are absent, never 0. */
  values: Map<string, number>;
  /** For counts that grow through the day: yesterday's value at this same time, so a half-done day races a fair opponent. */
  pace?: { key: string; value: number; at: string };
}

export interface Summary {
  metric: Metric;
  latest?: Point;
  prev?: Point;
  delta?: number;
  verdict?: 'better' | 'same' | 'worse';
  avg7?: number;
  avg7Prev?: number;
  avg30?: number;
  avg30Prev?: number;
  best?: Point;
  /** The latest value beats every earlier one. */
  isBest: boolean;
  count: number;
  first?: string;
  /** How the comparison is worded when it is not simply the previous record. */
  vsLabel?: string;
}

interface DayAgg { breath: number; workouts: number; reps: number; pushupMax: number; tasks: number }

export function buildMetrics(
  logs: Record<string, MonthLog>,
  tasks: Record<string, Task>,
  digests: Record<string, Digest>,
  settings: Settings,
  plan: Plan | null,
  today: string,
  now: Date = new Date(),
): Metric[] {
  const R = settings.rolloverHour;
  const dayOf = (ts: number) => {
    const d = new Date(ts);
    if (d.getHours() < R) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const dayLogs = new Map<string, DayLog>();
  const agg = new Map<string, DayAgg>();
  const at = (k: string) => {
    let a = agg.get(k);
    if (!a) agg.set(k, (a = { breath: 0, workouts: 0, reps: 0, pushupMax: 0, tasks: 0 }));
    return a;
  };
  for (const m of Object.values(logs)) {
    for (const [k, dl] of Object.entries(m.days || {})) dayLogs.set(k, dl);
    for (const b of Object.values(m.breath || {})) at(dayOf(b.start)).breath += b.minutes;
    for (const w of Object.values(m.workouts || {})) {
      const a = at(dayOf(w.start));
      a.workouts += 1;
      for (const [ex, sets] of Object.entries(w.exercises || {})) {
        for (const s of sets) {
          a.reps += s.reps || 0;
          if (ex === 'pushup' && s.level >= 3) a.pushupMax = Math.max(a.pushupMax, s.reps || 0);
        }
      }
    }
  }
  for (const t of Object.values(tasks)) if (t.status === 'done' && t.doneAt) at(dayOf(t.doneAt)).tasks += 1;

  const keys = [...new Set([...dayLogs.keys(), ...agg.keys()])].filter((k) => k <= today).sort();
  const first = keys[0];
  const span: string[] = [];
  if (first) for (let k = first; k <= today; k = addDays(k, 1)) span.push(k);

  const metric = (id: string, group: Group, label: string, unit: string, better: 'up' | 'down', tone: string, decimals = 0): Metric => ({ id, group, label, unit, better, tone, decimals, values: new Map() });
  const routine = metric('routine', 'Day', 'กิจวัตรที่ทำ', '%', 'up', 'var(--good)');
  const tasksDone = metric('tasks', 'Day', 'งานที่เสร็จ', '', 'up', 'var(--accent)');
  const meds = metric('meds', 'Health', 'กินยาครบ', '%', 'up', 'var(--a-growth)');
  const onTime = metric('lightsout', 'Sleep', 'ปิดไฟตรงเวลา 7 วันล่าสุด', 'คืน', 'up', 'var(--a-home)');
  const wk7 = metric('workouts', 'Body', 'ออกกำลังกาย 7 วันล่าสุด', 'ครั้ง', 'up', 'var(--a-health)');
  const push = metric('pushup', 'Body', 'วิดพื้นเซ็ตที่ดีที่สุด', 'ครั้ง', 'up', 'var(--a-health)');
  const reps = metric('reps', 'Body', 'จำนวนครั้งรวมที่ออกกำลัง', 'ครั้ง', 'up', 'var(--a-health)');
  const breath = metric('breath', 'Body', 'หายใจท้อง', 'นาที', 'up', 'var(--a-health)');
  const sales = metric('sales', 'Seoulful', 'ยอดขายที่รายงาน', '฿', 'up', 'var(--a-seoulful)');
  const rating = metric('rating', 'Seoulful', 'ดาวรีวิว', '★', 'up', 'var(--a-seoulful)', 1);

  for (const k of span) {
    const dl = dayLogs.get(k);
    const a = agg.get(k);
    if (dl) {
      const checks = dl.checks || {};
      const items = allItems(buildDay(k, settings, plan, dl, dayLogs.get(addDays(k, -1))));
      if (items.length) routine.values.set(k, Math.round((items.filter((i) => checks[i.id]).length / items.length) * 100));
      const medItems = items.filter((i) => i.kind === 'med');
      if (medItems.length) meds.values.set(k, Math.round((medItems.filter((i) => checks[i.id]).length / medItems.length) * 100));
    }
    if (a?.breath) breath.values.set(k, Math.round(a.breath));
    if (a?.workouts) reps.values.set(k, a.reps);
    if (a?.pushupMax) push.values.set(k, a.pushupMax);
    // Counts and rolling windows are real zeros on every day since the first record.
    tasksDone.values.set(k, a?.tasks || 0);
    let w = 0;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(k, -i);
      w += agg.get(d)?.workouts || 0;
      if (dayLogs.get(d)?.checks?.['lights-out']) n++;
    }
    wk7.values.set(k, w);
    onTime.values.set(k, n);
  }
  for (const d of Object.values(digests)) {
    const items = Object.values(d.items || {});
    const amounts = items.filter((i) => i.kind === 'sales' && typeof i.amount === 'number').map((i) => i.amount as number);
    if (amounts.length) sales.values.set(d.date, amounts.reduce((x, y) => x + y, 0));
    const stars = items.filter((i) => i.kind === 'review' && typeof i.rating === 'number').map((i) => i.rating as number);
    if (stars.length) rating.values.set(d.date, stars.reduce((x, y) => x + y, 0) / stars.length);
  }
  // Race yesterday at the same clock time for the two counts that fill up during the day.
  const yesterday = addDays(today, -1);
  const cutoff = now.getTime() - 86400000;
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const yLog = dayLogs.get(yesterday);
  if (yLog && routine.values.has(today)) {
    const items = allItems(buildDay(yesterday, settings, plan, yLog, dayLogs.get(addDays(yesterday, -1))));
    const done = items.filter((i) => {
      const v = yLog.checks?.[i.id];
      return !!v && (v < 1e12 || v <= cutoff);
    }).length;
    if (items.length) routine.pace = { key: yesterday, value: Math.round((done / items.length) * 100), at: clock };
  }
  if (tasksDone.values.has(yesterday)) {
    const n = Object.values(tasks).filter((t) => t.status === 'done' && t.doneAt && dayOf(t.doneAt) === yesterday && t.doneAt <= cutoff).length;
    tasksDone.pace = { key: yesterday, value: n, at: clock };
  }
  return [routine, tasksDone, onTime, wk7, push, reps, breath, meds, sales, rating];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

export function summarize(m: Metric, today: string): Summary {
  const pts = [...m.values.entries()].filter(([k]) => k <= today).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => ({ key, value }));
  const inRange = (from: string, to: string) => pts.filter((p) => p.key >= from && p.key <= to).map((p) => p.value);
  const better = (a: number, b: number) => (m.better === 'up' ? a > b : a < b);
  const latest = pts[pts.length - 1];
  const live = !!m.pace && latest?.key === today;
  const prev = live ? { key: m.pace!.key, value: m.pace!.value } : pts[pts.length - 2];
  let best: Point | undefined;
  for (const p of pts) if (!best || better(p.value, best.value)) best = p;
  const eps = Math.pow(10, -m.decimals) / 2;
  const delta = latest && prev ? latest.value - prev.value : undefined;
  const verdict = delta == null ? undefined : Math.abs(delta) < eps ? 'same' : better(latest!.value, prev!.value) ? 'better' : 'worse';
  const earlier = pts.slice(0, -1);
  return {
    metric: m,
    latest,
    prev,
    delta,
    verdict,
    avg7: mean(inRange(addDays(today, -6), today)),
    avg7Prev: mean(inRange(addDays(today, -13), addDays(today, -7))),
    avg30: mean(inRange(addDays(today, -29), today)),
    avg30Prev: mean(inRange(addDays(today, -59), addDays(today, -30))),
    best,
    isBest: !!latest && earlier.length > 0 && earlier.every((p) => better(latest.value, p.value)),
    count: pts.length,
    first: pts[0]?.key,
    vsLabel: live ? `เทียบเมื่อวานเวลา ${m.pace!.at}` : undefined,
  };
}

/** Values for the last `n` days ending today, undefined where nothing was recorded. */
export function lastDays(m: Metric, today: string, n: number): { key: string; value: number | undefined }[] {
  return Array.from({ length: n }, (_, i) => {
    const key = addDays(today, i - n + 1);
    return { key, value: m.values.get(key) };
  });
}

export function fmtValue(m: Metric, v: number | undefined): string {
  if (v == null) return '–';
  if (m.unit === '฿') return '฿' + Math.round(v).toLocaleString();
  const s = m.decimals ? v.toFixed(m.decimals) : Math.round(v).toLocaleString();
  return m.unit && m.unit !== '%' && !m.unit.startsWith('/') ? `${s} ${m.unit}` : `${s}${m.unit}`;
}
