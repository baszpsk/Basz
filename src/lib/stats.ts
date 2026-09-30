// Totals, streaks and series for the Body screens. Everything is derived
// from the logs, so numbers can never drift from what actually happened.

import { addDays, keyToDate, monthOf, weekday } from './time';
import type { MonthLog, Plan, Task } from './types';

export interface DayPoint { key: string; value: number }

export interface Stats {
  focus: { todayMin: number; todaySessions: number; weekMin: number; lastWeekMin: number; totalMin: number; totalSessions: number; streak: number; days: DayPoint[]; byHour: number[] };
  workouts: { total: number; thisWeek: number; lastWeek: number; weekStreak: number; pushupBest: number; days: DayPoint[] };
  breath: { todayMin: number; weekMin: number; totalMin: number; days: DayPoint[] };
  sleep: { streak: number; last14: number };
  meds: { streak: number; adherence14: number };
  tasks: { doneToday: number; doneWeek: number; doneTotal: number };
  checksToday: number;
}

/** Monday-based week start for a day key. */
export function weekStart(key: string): string {
  const wd = weekday(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

export function computeStats(logs: Record<string, MonthLog>, tasks: Record<string, Task>, plan: Plan | null, today: string, rollover: number): Stats {
  const days = new Map<string, { checks: number; focus: number; sessions: number; breath: number; workouts: number; lightsOut: boolean; medsOk: boolean }>();
  const get = (k: string) => {
    let d = days.get(k);
    if (!d) days.set(k, (d = { checks: 0, focus: 0, sessions: 0, breath: 0, workouts: 0, lightsOut: false, medsOk: false }));
    return d;
  };
  const byHour = new Array(24).fill(0);
  let pushupBest = 0;
  const dayOf = (ts: number) => {
    const d = new Date(ts);
    if (d.getHours() < rollover) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  for (const m of Object.values(logs)) {
    for (const [k, dl] of Object.entries(m.days || {})) {
      const d = get(k);
      const checks = Object.entries(dl.checks || {}).filter(([, v]) => !!v);
      d.checks += checks.length;
      d.lightsOut = checks.some(([id]) => id === 'lights-out');
      const wd = weekday(k);
      const meds = (plan?.meds || []).filter((x) => !x.days || x.days.includes(wd));
      d.medsOk = meds.length > 0 && meds.every((x) => !!dl.checks?.['med-' + x.id]);
    }
    for (const f of Object.values(m.focus || {})) {
      if (f.kind !== 'work') continue;
      const d = get(dayOf(f.start));
      d.focus += f.minutes;
      d.sessions += 1;
      byHour[new Date(f.start).getHours()] += f.minutes;
    }
    for (const b of Object.values(m.breath || {})) {
      const d = get(dayOf(b.start));
      d.breath += b.minutes;
    }
    for (const w of Object.values(m.workouts || {})) {
      const d = get(dayOf(w.start));
      d.workouts += 1;
      for (const s of w.exercises.pushup || []) if (s.level >= 3 && (s.reps || 0) > pushupBest) pushupBest = s.reps || 0;
    }
  }
  let doneTotal = 0;
  for (const t of Object.values(tasks)) {
    if (t.status !== 'done' || !t.doneAt) continue;
    doneTotal++;
  }

  const series = (n: number, f: (k: string) => number): DayPoint[] =>
    Array.from({ length: n }, (_, i) => {
      const k = addDays(today, i - n + 1);
      return { key: k, value: f(k) };
    });
  const sumRange = (from: string, to: string, f: (d: ReturnType<typeof get>) => number) => {
    let s = 0;
    for (let k = from; k <= to; k = addDays(k, 1)) s += days.has(k) ? f(days.get(k)!) : 0;
    return s;
  };
  const streak = (ok: (k: string) => boolean) => {
    let k = ok(today) ? today : addDays(today, -1);
    let n = 0;
    while (ok(k)) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  };
  const ws = weekStart(today);
  const lws = addDays(ws, -7);
  const lwe = addDays(ws, -1);
  const t = days.get(today);

  const focusWeek = sumRange(ws, today, (d) => d.focus);
  const focusLast = sumRange(lws, lwe, (d) => d.focus);
  const wkThis = sumRange(ws, today, (d) => d.workouts);
  const wkLast = sumRange(lws, lwe, (d) => d.workouts);
  const breathWeek = sumRange(ws, today, (d) => d.breath);

  let weekStreak = 0;
  for (let s = wkThis >= 3 ? ws : lws; ; s = addDays(s, -7)) {
    if (sumRange(s, addDays(s, 6), (d) => d.workouts) >= 3) weekStreak++;
    else break;
    if (weekStreak > 520) break;
  }

  const last14 = series(14, (k) => (days.get(k)?.lightsOut ? 1 : 0)).reduce((a, p) => a + p.value, 0);
  const meds14 = series(14, (k) => (days.get(k)?.medsOk ? 1 : 0)).reduce((a, p) => a + p.value, 0);
  const allDays = [...days.values()];
  const totalSessions = allDays.reduce((a, d) => a + d.sessions, 0);
  const totalFocus = allDays.reduce((a, d) => a + d.focus, 0);
  const totalWorkouts = allDays.reduce((a, d) => a + d.workouts, 0);
  const totalBreath = allDays.reduce((a, d) => a + d.breath, 0);
  const sleepStreak = streak((k) => !!days.get(k)?.lightsOut);
  const medsStreak = streak((k) => !!days.get(k)?.medsOk);
  const focusStreak = streak((k) => (days.get(k)?.focus || 0) >= 50);
  const doneWeek = Object.values(tasks).filter((x) => x.status === 'done' && x.doneAt && dayOf(x.doneAt) >= ws).length;
  const doneToday = Object.values(tasks).filter((x) => x.status === 'done' && x.doneAt && dayOf(x.doneAt) === today).length;

  return {
    focus: { todayMin: t?.focus || 0, todaySessions: t?.sessions || 0, weekMin: focusWeek, lastWeekMin: focusLast, totalMin: totalFocus, totalSessions, streak: focusStreak, days: series(84, (k) => days.get(k)?.focus || 0), byHour },
    workouts: { total: totalWorkouts, thisWeek: wkThis, lastWeek: wkLast, weekStreak, pushupBest, days: series(84, (k) => days.get(k)?.workouts || 0) },
    breath: { todayMin: t?.breath || 0, weekMin: breathWeek, totalMin: totalBreath, days: series(14, (k) => days.get(k)?.breath || 0) },
    sleep: { streak: sleepStreak, last14 },
    meds: { streak: medsStreak, adherence14: meds14 / 14 },
    tasks: { doneToday, doneWeek, doneTotal },
    checksToday: t?.checks || 0,
  };
}

export const monthKeyNow = (today: string) => monthOf(today);
export const dayDate = keyToDate;
