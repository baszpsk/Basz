// "You vs your past self". Every metric is a daily series derived from the
// logs, compared with the last time it was recorded, with recent averages and
// with its all-time best. Nothing is stored here: history lasts as long as the
// logs do, and the numbers can never drift from what actually happened.

import { allItems, buildDay } from './schedule';
import type { Period } from './range';
import { addDays } from './time';
import type { DayLog, Digest, MonthLog, Plan, Settings, Task } from './types';

export type Group = 'Day' | 'Sleep' | 'Body' | 'Health' | 'Seoulful';
/** Section headings for each group. */
export const GROUP_LABEL: Record<Group, string> = { Day: 'ประจำวัน', Sleep: 'การนอน', Body: 'ร่างกาย', Health: 'สุขภาพ', Seoulful: 'ร้าน Seoulful' };
export interface Point { key: string; value: number }
/** วิธีรวมค่ารายวันเมื่อดูเป็นช่วง: รวมทั้งช่วง เฉลี่ยต่อวันที่บันทึก หรือค่าสูงสุด */
export type Agg = 'sum' | 'mean' | 'max';
export const AGG_TEXT: Record<Agg, string> = { sum: 'รวมทั้งช่วง', mean: 'เฉลี่ยต่อวันที่บันทึก', max: 'สูงสุดในช่วง' };

export interface Metric {
  id: string;
  group: Group;
  label: string;
  unit: string;
  better: 'up' | 'down';
  tone: string;
  decimals: number;
  agg: Agg;
  /** Recorded values by logical day. Days without data are absent, never 0. */
  values: Map<string, number>;
  /** ค่ารายวันจริง สำหรับตัวที่ values เป็นยอด 7 วันล่าสุด ใช้เมื่อดูเป็นช่วง */
  daily?: Map<string, number>;
  /** ชื่อเมื่อดูเป็นช่วง ถ้าต่างจากชื่อปกติ */
  periodLabel?: string;
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

interface DayAgg { breath: number; workouts: number; reps: number; pushupMax: number; tasks: number; pomos: number; focusSec: number }

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
    if (!a) agg.set(k, (a = { breath: 0, workouts: 0, reps: 0, pushupMax: 0, tasks: 0, pomos: 0, focusSec: 0 }));
    return a;
  };
  // Pomodoro focus rounds: full ones count, and every counted second adds to focus time.
  const focusRounds: { day: string; end: number; full: boolean; sec: number }[] = [];
  let firstFocus: string | undefined;
  for (const m of Object.values(logs)) {
    for (const [k, dl] of Object.entries(m.days || {})) dayLogs.set(k, dl);
    for (const f of Object.values(m.focus || {})) {
      if (f.kind !== 'work') continue;
      const day = dayOf(f.start);
      const r = { day, end: f.end, full: f.completed !== false, sec: f.activeSec ?? f.minutes * 60 };
      focusRounds.push(r);
      const a = at(day);
      if (r.full) a.pomos += 1;
      a.focusSec += r.sec;
      if (!firstFocus || day < firstFocus) firstFocus = day;
    }
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

  const metric = (id: string, group: Group, label: string, unit: string, better: 'up' | 'down', tone: string, agg: Agg, decimals = 0): Metric => ({ id, group, label, unit, better, tone, decimals, agg, values: new Map() });
  const routine = metric('routine', 'Day', 'กิจวัตรที่ทำ', '%', 'up', 'var(--good)', 'mean');
  const tasksDone = metric('tasks', 'Day', 'งานที่เสร็จ', '', 'up', 'var(--accent)', 'sum');
  const pomos = metric('pomodoros', 'Day', 'Pomodoro ที่ครบ', 'รอบ', 'up', 'var(--accent)', 'sum');
  const focusMin = metric('focusmin', 'Day', 'เวลาโฟกัส', 'นาที', 'up', 'var(--accent)', 'sum');
  const meds = metric('meds', 'Health', 'กินยาครบ', '%', 'up', 'var(--a-growth)', 'mean');
  const onTime = metric('lightsout', 'Sleep', 'ปิดไฟตรงเวลา 7 วันล่าสุด', 'คืน', 'up', 'var(--a-home)', 'sum');
  const wk7 = metric('workouts', 'Body', 'ออกกำลังกาย 7 วันล่าสุด', 'ครั้ง', 'up', 'var(--a-health)', 'sum');
  const push = metric('pushup', 'Body', 'วิดพื้นเซ็ตที่ดีที่สุด', 'ครั้ง', 'up', 'var(--a-health)', 'max');
  const reps = metric('reps', 'Body', 'จำนวนครั้งรวมที่ออกกำลัง', 'ครั้ง', 'up', 'var(--a-health)', 'sum');
  const breath = metric('breath', 'Body', 'หายใจท้อง', 'นาที', 'up', 'var(--a-health)', 'sum');
  const sales = metric('sales', 'Seoulful', 'ยอดขายที่รายงาน', '฿', 'up', 'var(--a-seoulful)', 'sum');
  const rating = metric('rating', 'Seoulful', 'ดาวรีวิว', '★', 'up', 'var(--a-seoulful)', 'mean', 1);
  // สองตัวนี้ปกติแสดงยอด 7 วันล่าสุด เมื่อดูเป็นช่วงจึงใช้ค่ารายวันจริงรวมกันแทน
  onTime.daily = new Map();
  onTime.periodLabel = 'คืนที่ปิดไฟตรงเวลา';
  wk7.daily = new Map();
  wk7.periodLabel = 'ออกกำลังกาย';

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
    // Zero is real only once he has started using the timer.
    if (firstFocus && k >= firstFocus) {
      pomos.values.set(k, a?.pomos || 0);
      focusMin.values.set(k, Math.round((a?.focusSec || 0) / 60));
    }
    let w = 0;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(k, -i);
      w += agg.get(d)?.workouts || 0;
      if (dayLogs.get(d)?.checks?.['lights-out']) n++;
    }
    wk7.values.set(k, w);
    onTime.values.set(k, n);
    wk7.daily!.set(k, a?.workouts || 0);
    if (dl) onTime.daily!.set(k, dl.checks?.['lights-out'] ? 1 : 0);
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
  if (pomos.values.has(yesterday)) {
    const y = focusRounds.filter((r) => r.day === yesterday && r.end <= cutoff);
    pomos.pace = { key: yesterday, value: y.filter((r) => r.full).length, at: clock };
    focusMin.pace = { key: yesterday, value: Math.round(y.reduce((s, r) => s + r.sec, 0) / 60), at: clock };
  }
  return [routine, tasksDone, pomos, focusMin, onTime, wk7, push, reps, breath, meds, sales, rating];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** วันนี้จริง (realToday) ใช้ตัดสินว่าจะเทียบกับเมื่อวานเวลาเดียวกันไหม เมื่อดูวันอื่นจะเทียบกับครั้งก่อนที่บันทึกตามปกติ */
export function summarize(m: Metric, today: string, realToday = today): Summary {
  const pts = [...m.values.entries()].filter(([k]) => k <= today).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => ({ key, value }));
  const inRange = (from: string, to: string) => pts.filter((p) => p.key >= from && p.key <= to).map((p) => p.value);
  const better = (a: number, b: number) => (m.better === 'up' ? a > b : a < b);
  const latest = pts[pts.length - 1];
  const live = !!m.pace && today === realToday && latest?.key === today;
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

/** ค่ารวมของช่วง from ถึง to ตามวิธีรวมของตัวชี้วัด ไม่มีบันทึกเลยได้ undefined */
export function periodValue(m: Metric, from: string, to: string): number | undefined {
  const src = m.daily || m.values;
  let n = 0;
  let acc = 0;
  let top = -Infinity;
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const v = src.get(k);
    if (v == null) continue;
    n += 1;
    acc += v;
    top = Math.max(top, v);
  }
  if (!n) return undefined;
  return m.agg === 'sum' ? acc : m.agg === 'mean' ? acc / n : top;
}

export interface PeriodSummary {
  metric: Metric;
  cur?: number;
  prev?: number;
  delta?: number;
  verdict?: 'better' | 'same' | 'worse';
  buckets: { key: string; label: string; tick: string; value: number | undefined; future: boolean }[];
  /** วันที่มีบันทึกในช่วงนี้ */
  count: number;
  /** ค่ารายวันที่ดีที่สุดตลอดกาล */
  best?: Point;
  first?: string;
}

export function summarizePeriod(m: Metric, p: Period): PeriodSummary {
  const src = m.daily || m.values;
  const cur = periodValue(m, p.from, p.end);
  const prev = p.prev ? periodValue(m, p.prev.from, p.prev.end) : undefined;
  const better = (a: number, b: number) => (m.better === 'up' ? a > b : a < b);
  const eps = Math.pow(10, -m.decimals) / 2;
  const delta = cur != null && prev != null ? cur - prev : undefined;
  const verdict = delta == null ? undefined : Math.abs(delta) < eps ? 'same' : better(cur!, prev!) ? 'better' : 'worse';
  let count = 0;
  for (let k = p.from; k <= p.end; k = addDays(k, 1)) if (src.has(k)) count += 1;
  let best: Point | undefined;
  let first: string | undefined;
  for (const [key, value] of src) {
    if (!first || key < first) first = key;
    if (!best || better(value, best.value)) best = { key, value };
  }
  return {
    metric: m,
    cur,
    prev,
    delta,
    verdict,
    buckets: p.buckets.map((b) => ({ key: b.key, label: b.label, tick: b.tick, future: b.future, value: b.future || p.unit === 'hour' ? undefined : periodValue(m, b.from, b.to < p.end ? b.to : p.end) })),
    count,
    best,
    first,
  };
}
