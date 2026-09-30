// Everything the Pomodoro log can tell. Nothing is stored here: every number
// is recomputed from the recorded rounds, so it never drifts from them.
// Definitions the page shows:
// - a full round ran its whole planned length; a stopped round ended early
//   (focus rounds under a minute are never recorded);
// - rounds in a row = full focus rounds on the same day where each one
//   started within (rest + 5) minutes of the previous one ending;
// - back after rest = minutes from a rest ending to the next focus round
//   starting on the same day.
// ตัวเลขตามช่วงเวลา (focusPeriod) นับเฉพาะรอบในช่วงที่เลือก วันก่อนเริ่มใช้แอปไม่นับเป็นวันศูนย์
// และถ้าช่วงนี้ยังไม่จบ ช่วงก่อนหน้านับแค่ถึงเวลาเดียวกัน

import { AREA_LABEL } from './priority';
import { bucketsOf, dayStartTs, type Bucket, type Period } from './range';
import { addDays, daysBetween, pad, todayKey, wdName, weekday } from './time';
import type { Area, FocusSession, MonthLog, Task } from './types';

export interface Round extends FocusSession {
  id: string;
  day: string;
}

export interface DayFocus {
  key: string;
  done: number;
  stopped: number;
  focusSec: number;
  pauses: number;
  pausedSec: number;
  restsFull: number;
  restsCut: number;
  firstStart?: number;
  lastEnd?: number;
  chain: number;
}

export interface Span {
  done: number;
  stopped: number;
  focusSec: number;
  activeDays: number;
  /** Full rounds ÷ all focus rounds, when there were any. */
  rate?: number;
}

export interface Quality {
  rounds: number;
  rate?: number;
  pausesPerRound?: number;
  pausedMinPerRound?: number;
  noPauseShare?: number;
  restsFullShare?: number;
  backMedianMin?: number;
  focusMinPerActiveDay?: number;
}

export interface FocusReport {
  rows: Round[];
  today: DayFocus;
  /** Yesterday up to this same clock time. */
  pace?: { done: number; focusSec: number };
  /** วันติดกันที่มีรอบครบ นับวันนี้เมื่อวันนี้ครบแล้วอย่างน้อยหนึ่งรอบ */
  streak: number;
  /** วันแรกที่มีบันทึก */
  first?: string;
}

export interface BucketFocus {
  b: Bucket;
  done: number;
  stopped: number;
  focusSec: number;
}

export interface PeriodFocus {
  rows: Round[];
  cur: Span;
  /** วันที่นับในช่วงนี้ เริ่มนับตั้งแต่วันแรกที่มีบันทึก */
  curDays: number;
  prev?: Span;
  prevDays?: number;
  buckets: BucketFocus[];
  /** รอบที่ครบเฉลี่ยต่อช่องของช่วงก่อนหน้าทั้งช่วง */
  prevAvg?: number;
  quality: Quality;
  byHour: number[];
  /** จันทร์ก่อน: รอบที่ครบเฉลี่ยต่อวันปฏิทินในช่วง */
  byWeekday: { label: string; avg: number }[];
  byArea: { label: string; done: number; focusSec: number }[];
  byTask: { label: string; done: number; stopped: number; focusSec: number }[];
  best?: { key: string; done: number };
  longestStreak: number;
  longestChain: { n: number; key?: string };
  heat: { key: string; value: number }[];
}

export const isFull = (r: FocusSession) => r.completed !== false;
export const secOf = (r: FocusSession) => r.activeSec ?? r.minutes * 60;

export function collectRounds(logs: Record<string, MonthLog>, rollover: number): Round[] {
  const rows: Round[] = [];
  for (const m of Object.values(logs)) {
    for (const [id, f] of Object.entries(m.focus || {})) rows.push({ ...f, id, day: todayKey(new Date(f.start), rollover) });
  }
  return rows.sort((a, b) => a.start - b.start);
}

const emptyDay = (key: string): DayFocus => ({ key, done: 0, stopped: 0, focusSec: 0, pauses: 0, pausedSec: 0, restsFull: 0, restsCut: 0, chain: 0 });
const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function spanOf(works: Round[]): Span {
  const out: Span = { done: 0, stopped: 0, focusSec: 0, activeDays: 0 };
  const days = new Set<string>();
  for (const r of works) {
    if (isFull(r)) out.done += 1;
    else out.stopped += 1;
    out.focusSec += secOf(r);
    days.add(r.day);
  }
  out.activeDays = days.size;
  if (out.done + out.stopped > 0) out.rate = out.done / (out.done + out.stopped);
  return out;
}

/** รอบที่ครบติดกัน: วันเดียวกัน และรอบถัดไปเริ่มภายใน (พัก + 5) นาทีหลังรอบก่อนจบ ต้องเรียงตามเวลา */
function chains(works: Round[], restMin: number) {
  const gap = (restMin + 5) * 60000;
  const perDay = new Map<string, number>();
  const longest: { n: number; key?: string } = { n: 0 };
  let run = 0;
  let prev: Round | null = null;
  for (const r of works) {
    if (!isFull(r)) run = 0;
    else run = run > 0 && prev && prev.day === r.day && r.start - prev.end <= gap ? run + 1 : 1;
    prev = r;
    perDay.set(r.day, Math.max(perDay.get(r.day) || 0, run));
    if (run > longest.n) {
      longest.n = run;
      longest.key = r.day;
    }
  }
  return { perDay, longest };
}

function qualityOf(works: Round[], rests: Round[], allWorks: Round[], span: Span): Quality {
  const back: number[] = [];
  for (const rest of rests) {
    const next = allWorks.find((w) => w.start >= rest.end && w.day === rest.day);
    if (next) back.push(Math.max(0, next.start - rest.end) / 60000);
  }
  const q: Quality = { rounds: works.length };
  if (works.length) {
    q.rate = span.rate;
    q.pausesPerRound = works.reduce((a, r) => a + (r.pauses?.length || 0), 0) / works.length;
    q.pausedMinPerRound = works.reduce((a, r) => a + (r.pausedSec || 0), 0) / 60 / works.length;
    q.noPauseShare = works.filter((r) => !r.pauses?.length).length / works.length;
  }
  if (rests.length) q.restsFullShare = rests.filter(isFull).length / rests.length;
  q.backMedianMin = median(back);
  if (span.activeDays) q.focusMinPerActiveDay = span.focusSec / 60 / span.activeDays;
  return q;
}

/** วันนี้แบบสด: ตัวเลขของวันนี้ เมื่อวานเวลาเดียวกัน และวันติดกัน */
export function focusReport(logs: Record<string, MonthLog>, rollover: number, restMin: number, today: string, now: Date): FocusReport {
  const rows = collectRounds(logs, rollover);
  const works = rows.filter((r) => r.kind === 'work' && r.day <= today);
  const t = emptyDay(today);
  const dayDone = new Map<string, number>();
  for (const r of works) {
    if (isFull(r)) dayDone.set(r.day, (dayDone.get(r.day) || 0) + 1);
    if (r.day !== today) continue;
    if (isFull(r)) t.done += 1;
    else t.stopped += 1;
    t.focusSec += secOf(r);
    t.pauses += r.pauses?.length || 0;
    t.pausedSec += r.pausedSec || 0;
    t.firstStart = Math.min(t.firstStart ?? r.start, r.start);
    t.lastEnd = Math.max(t.lastEnd ?? r.end, r.end);
  }
  for (const r of rows) {
    if (r.kind !== 'break' || r.day !== today) continue;
    if (isFull(r)) t.restsFull += 1;
    else t.restsCut += 1;
  }
  t.chain = chains(works.filter((r) => r.day === today), restMin).longest.n;

  // Yesterday up to this same clock time, so a half-done day races a fair opponent.
  const yesterday = addDays(today, -1);
  const cutoff = now.getTime() - 86400000;
  const yWorks = works.filter((r) => r.day === yesterday && r.end <= cutoff);
  const pace = works.some((r) => r.day === yesterday) ? { done: yWorks.filter(isFull).length, focusSec: yWorks.reduce((a, r) => a + secOf(r), 0) } : undefined;

  // Current streak counts today only once a round is done; until then it runs to yesterday.
  let streak = 0;
  for (let k = (dayDone.get(today) || 0) > 0 ? today : yesterday; (dayDone.get(k) || 0) > 0; k = addDays(k, -1)) streak += 1;
  return { rows, today: t, pace, streak, first: rows[0]?.day };
}

/** ทุกตัวเลขของช่วงที่เลือก เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน */
export function focusPeriod(rows: Round[], p: Period, tasks: Record<string, Task>, restMin: number, rollover: number, today: string, now: Date, first?: string): PeriodFocus {
  const allWorks = rows.filter((r) => r.kind === 'work');
  const inside = (r: Round, from: string, to: string) => r.day >= from && r.day <= to;
  const cut = rows.filter((r) => inside(r, p.from, p.end));
  const works = cut.filter((r) => r.kind === 'work');
  const rests = cut.filter((r) => r.kind === 'break');
  const cur = spanOf(works);
  // วันก่อนเริ่มใช้แอปไม่ใช่วันที่ไม่ได้ทำ จึงเริ่มนับตั้งแต่วันแรกที่มีบันทึก
  const countFrom = (from: string) => (first && first > from ? first : from);
  const curDays = first && first <= p.end ? daysBetween(countFrom(p.from), p.end) + 1 : 0;

  let prev: Span | undefined;
  let prevDays: number | undefined;
  let prevAvg: number | undefined;
  const cp = p.prev;
  if (cp && first && first <= cp.end) {
    const cutoff = cp.partial ? dayStartTs(cp.from, rollover) + (now.getTime() - dayStartTs(p.from, rollover)) : Infinity;
    prev = spanOf(allWorks.filter((r) => inside(r, cp.from, cp.to) && r.end <= cutoff));
    prevDays = daysBetween(countFrom(cp.from), cp.end) + 1;
  }
  if (cp && p.unit !== 'hour' && first && first <= cp.to) {
    const slots = bucketsOf(p.unit, countFrom(cp.from), cp.to, today, rollover, now).length;
    const full = allWorks.filter((r) => isFull(r) && inside(r, cp.from, cp.to)).length;
    if (slots) prevAvg = full / slots;
  }

  const buckets: BucketFocus[] = p.buckets.map((b) => ({ b, done: 0, stopped: 0, focusSec: 0 }));
  for (const r of works) {
    const x = p.unit === 'hour' ? buckets.find((q) => q.b.hour === new Date(r.start).getHours()) : buckets.find((q) => r.day >= q.b.from && r.day <= q.b.to);
    if (!x) continue;
    if (isFull(r)) x.done += 1;
    else x.stopped += 1;
    x.focusSec += secOf(r);
  }

  const byHour = Array.from({ length: 24 }, () => 0);
  const dayDone = new Map<string, number>();
  for (const r of works) {
    if (!isFull(r)) continue;
    byHour[new Date(r.start).getHours()] += 1;
    dayDone.set(r.day, (dayDone.get(r.day) || 0) + 1);
  }

  const wdDone = Array.from({ length: 7 }, () => 0);
  const wdDays = Array.from({ length: 7 }, () => 0);
  let best: { key: string; done: number } | undefined;
  let longestStreak = 0;
  let run = 0;
  if (curDays) {
    for (let k = countFrom(p.from); k <= p.end; k = addDays(k, 1)) {
      const d = dayDone.get(k) || 0;
      const w = weekday(k);
      wdDays[w] += 1;
      wdDone[w] += d;
      if (d > (best?.done ?? 0)) best = { key: k, done: d };
      run = d > 0 ? run + 1 : 0;
      longestStreak = Math.max(longestStreak, run);
    }
  }
  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((w) => ({ label: wdName(w), avg: wdDays[w] ? wdDone[w] / wdDays[w] : 0 }));

  const areaMap = new Map<string, { label: string; done: number; focusSec: number }>();
  const taskMap = new Map<string, { label: string; done: number; stopped: number; focusSec: number }>();
  for (const r of works) {
    const aKey = r.area || '-';
    const a = areaMap.get(aKey) || { label: r.area ? AREA_LABEL[r.area as Area] : 'ไม่ได้เลือกงาน', done: 0, focusSec: 0 };
    if (isFull(r)) a.done += 1;
    a.focusSec += secOf(r);
    areaMap.set(aKey, a);
    if (!r.taskId) continue;
    const t = taskMap.get(r.taskId) || { label: tasks[r.taskId]?.title || r.label || 'งานที่ลบไปแล้ว', done: 0, stopped: 0, focusSec: 0 };
    if (isFull(r)) t.done += 1;
    else t.stopped += 1;
    t.focusSec += secOf(r);
    taskMap.set(r.taskId, t);
  }

  // ปฏิทินสีแสดงเมื่อช่วงยาวพอ และไม่เกิน 53 สัปดาห์ล่าสุดของช่วง
  const heat: { key: string; value: number }[] = [];
  if (curDays >= 28) {
    const daySec = new Map<string, number>();
    for (const r of works) daySec.set(r.day, (daySec.get(r.day) || 0) + secOf(r));
    const hf = countFrom(p.from) > addDays(p.end, -370) ? countFrom(p.from) : addDays(p.end, -370);
    for (let k = hf; k <= p.end; k = addDays(k, 1)) heat.push({ key: k, value: Math.round((daySec.get(k) || 0) / 60) });
  }

  return {
    rows: cut,
    cur,
    curDays,
    prev,
    prevDays,
    buckets,
    prevAvg,
    quality: qualityOf(works, rests, allWorks, cur),
    byHour,
    byWeekday,
    byArea: [...areaMap.values()].sort((a, b) => b.focusSec - a.focusSec),
    byTask: [...taskMap.values()].sort((a, b) => b.focusSec - a.focusSec).slice(0, 8),
    best,
    longestStreak,
    longestChain: chains(works, restMin).longest,
    heat,
  };
}

const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const cell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ENDED: Record<string, string> = { timer: 'ครบเวลา', stop: 'กดจบก่อน', skip: 'ข้ามพัก', break: 'หยุดเพื่อพัก' };

/** Every recorded round, one row each, for a spreadsheet. The BOM lets Excel read Thai. */
export function focusCsv(rows: Round[], tasks: Record<string, Task>): string {
  const head = ['รหัส', 'วัน', 'ประเภท', 'เริ่ม', 'จบ', 'นาทีตามแผน', 'นาทีที่นับจริง', 'ครบรอบ', 'จบเพราะ', 'หยุดชั่วคราว (ครั้ง)', 'หยุดชั่วคราว (นาที)', 'งาน', 'หมวด'];
  const lines = rows.map((r) =>
    [
      r.id,
      r.day,
      r.kind === 'work' ? 'โฟกัส' : 'พัก',
      stamp(r.start),
      stamp(r.end),
      r.plannedSec != null ? (r.plannedSec / 60).toFixed(1) : '',
      (secOf(r) / 60).toFixed(1),
      isFull(r) ? 'ใช่' : 'ไม่',
      ENDED[r.endedBy || ''] || '',
      r.pauses?.length ?? 0,
      ((r.pausedSec || 0) / 60).toFixed(1),
      r.taskId ? tasks[r.taskId]?.title || r.label || '' : '',
      r.area ? AREA_LABEL[r.area] : '',
    ]
      .map(cell)
      .join(','),
  );
  return '﻿' + [head.join(','), ...lines].join('\r\n');
}
