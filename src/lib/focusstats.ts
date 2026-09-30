// Everything the Pomodoro log can tell. Nothing is stored here: every number
// is recomputed from the recorded rounds, so it never drifts from them.
// Definitions the page shows:
// - a full round ran its whole planned length; a stopped round ended early
//   (focus rounds under a minute are never recorded);
// - rounds in a row = full focus rounds on the same day where each one
//   started within (rest + 5) minutes of the previous one ending;
// - back after rest = minutes from a rest ending to the next focus round
//   starting on the same day.

import { AREA_LABEL } from './priority';
import { addDays, pad, todayKey, weekday } from './time';
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

export interface FocusReport {
  rows: Round[];
  today: DayFocus;
  /** Yesterday up to this same clock time. */
  pace?: { done: number; focusSec: number };
  last7: Span;
  prev7: Span;
  quality: {
    rounds: number;
    rate?: number;
    pausesPerRound?: number;
    pausedMinPerRound?: number;
    noPauseShare?: number;
    restsFullShare?: number;
    backMedianMin?: number;
    focusMinPerActiveDay?: number;
  };
  total: { done: number; stopped: number; focusSec: number; activeDays: number; first?: string; best?: { key: string; done: number }; streak: number; longestStreak: number; longestChain: { n: number; key?: string } };
  byHour: number[];
  /** Monday first: average full rounds per calendar day since the first record. */
  byWeekday: { label: string; avg: number }[];
  byArea: { label: string; done: number; focusSec: number }[];
  byTask: { label: string; done: number; stopped: number; focusSec: number }[];
  daily: { key: string; done: number; focusMin: number }[];
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

export function focusReport(logs: Record<string, MonthLog>, tasks: Record<string, Task>, rollover: number, restMin: number, today: string, now: Date): FocusReport {
  const rows = collectRounds(logs, rollover);
  const works = rows.filter((r) => r.kind === 'work' && r.day <= today);
  const rests = rows.filter((r) => r.kind === 'break' && r.day <= today);
  const days = new Map<string, DayFocus>();
  const day = (k: string) => {
    let d = days.get(k);
    if (!d) days.set(k, (d = emptyDay(k)));
    return d;
  };

  for (const r of works) {
    const d = day(r.day);
    if (isFull(r)) d.done += 1;
    else d.stopped += 1;
    d.focusSec += secOf(r);
    d.pauses += r.pauses?.length || 0;
    d.pausedSec += r.pausedSec || 0;
    d.firstStart = Math.min(d.firstStart ?? r.start, r.start);
    d.lastEnd = Math.max(d.lastEnd ?? r.end, r.end);
  }
  for (const r of rests) {
    const d = day(r.day);
    if (isFull(r)) d.restsFull += 1;
    else d.restsCut += 1;
  }

  // Rounds in a row: full focus rounds, same day, each starting soon after the last.
  const gap = (restMin + 5) * 60000;
  const longestChain: { n: number; key?: string } = { n: 0 };
  let run = 0;
  let prev: Round | null = null;
  for (const r of works) {
    if (!isFull(r)) run = 0;
    else run = run > 0 && prev && prev.day === r.day && r.start - prev.end <= gap ? run + 1 : 1;
    prev = r;
    const d = day(r.day);
    d.chain = Math.max(d.chain, run);
    if (run > longestChain.n) {
      longestChain.n = run;
      longestChain.key = r.day;
    }
  }

  const span = (from: string, to: string): Span => {
    const out: Span = { done: 0, stopped: 0, focusSec: 0, activeDays: 0 };
    for (let k = from; k <= to; k = addDays(k, 1)) {
      const d = days.get(k);
      if (!d) continue;
      out.done += d.done;
      out.stopped += d.stopped;
      out.focusSec += d.focusSec;
      if (d.done + d.stopped > 0) out.activeDays += 1;
    }
    if (out.done + out.stopped > 0) out.rate = out.done / (out.done + out.stopped);
    return out;
  };

  // Yesterday up to this same clock time, so a half-done day races a fair opponent.
  const yesterday = addDays(today, -1);
  const cutoff = now.getTime() - 86400000;
  const yWorks = works.filter((r) => r.day === yesterday && r.end <= cutoff);
  const pace = days.has(yesterday) ? { done: yWorks.filter(isFull).length, focusSec: yWorks.reduce((a, r) => a + secOf(r), 0) } : undefined;

  // Quality over the last 30 days.
  const from30 = addDays(today, -29);
  const w30 = works.filter((r) => r.day >= from30);
  const r30 = rests.filter((r) => r.day >= from30);
  const s30 = span(from30, today);
  const back: number[] = [];
  for (const rest of r30) {
    const next = works.find((w) => w.start >= rest.end && w.day === rest.day);
    if (next) back.push(Math.max(0, next.start - rest.end) / 60000);
  }
  const quality: FocusReport['quality'] = { rounds: w30.length };
  if (w30.length) {
    quality.rate = s30.rate;
    quality.pausesPerRound = w30.reduce((a, r) => a + (r.pauses?.length || 0), 0) / w30.length;
    quality.pausedMinPerRound = w30.reduce((a, r) => a + (r.pausedSec || 0), 0) / 60 / w30.length;
    quality.noPauseShare = w30.filter((r) => !r.pauses?.length).length / w30.length;
  }
  if (r30.length) quality.restsFullShare = r30.filter(isFull).length / r30.length;
  quality.backMedianMin = median(back);
  if (s30.activeDays) quality.focusMinPerActiveDay = s30.focusSec / 60 / s30.activeDays;

  // All time.
  const keys = [...days.keys()].sort();
  const first = keys[0];
  let best: { key: string; done: number } | undefined;
  let longestStreak = 0;
  let streakRun = 0;
  if (first) {
    for (let k = first; k <= today; k = addDays(k, 1)) {
      const d = days.get(k);
      if (d && d.done > (best?.done ?? 0)) best = { key: k, done: d.done };
      streakRun = d && d.done > 0 ? streakRun + 1 : 0;
      longestStreak = Math.max(longestStreak, streakRun);
    }
  }
  // Current streak counts today only once a round is done; until then it runs to yesterday.
  let streak = 0;
  for (let k = (days.get(today)?.done || 0) > 0 ? today : yesterday; (days.get(k)?.done || 0) > 0; k = addDays(k, -1)) streak += 1;
  const all = span(first || today, today);

  const byHour = Array.from({ length: 24 }, () => 0);
  for (const r of works) if (isFull(r)) byHour[new Date(r.start).getHours()] += 1;

  // Average full rounds per weekday over every calendar day since the first record.
  const wdDone = Array.from({ length: 7 }, () => 0);
  const wdDays = Array.from({ length: 7 }, () => 0);
  if (first) {
    for (let k = first; k <= today; k = addDays(k, 1)) {
      const w = weekday(k);
      wdDays[w] += 1;
      wdDone[w] += days.get(k)?.done || 0;
    }
  }
  const WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((w) => ({ label: WD[w], avg: wdDays[w] ? wdDone[w] / wdDays[w] : 0 }));

  const areaMap = new Map<string, { label: string; done: number; focusSec: number }>();
  const taskMap = new Map<string, { label: string; done: number; stopped: number; focusSec: number }>();
  for (const r of w30) {
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

  return {
    rows,
    today: days.get(today) || emptyDay(today),
    pace,
    last7: span(addDays(today, -6), today),
    prev7: span(addDays(today, -13), addDays(today, -7)),
    quality,
    total: { done: all.done, stopped: all.stopped, focusSec: all.focusSec, activeDays: keys.filter((k) => (days.get(k)?.done || 0) > 0).length, first, best, streak, longestStreak, longestChain },
    byHour,
    byWeekday,
    byArea: [...areaMap.values()].sort((a, b) => b.focusSec - a.focusSec),
    byTask: [...taskMap.values()].sort((a, b) => b.focusSec - a.focusSec).slice(0, 8),
    daily: Array.from({ length: 14 }, (_, i) => {
      const k = addDays(today, i - 13);
      const d = days.get(k);
      return { key: k, done: d?.done || 0, focusMin: Math.round((d?.focusSec || 0) / 60) };
    }),
    heat: Array.from({ length: 84 }, (_, i) => {
      const k = addDays(today, i - 83);
      return { key: k, value: Math.round((days.get(k)?.focusSec || 0) / 60) };
    }),
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
