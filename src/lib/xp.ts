// Stats and game layer. Everything is derived from the logs, so numbers can
// never drift from what actually happened.

import { addDays, keyToDate, monthOf, weekday } from './time';
import type { MonthLog, Plan, Task } from './types';

export interface DayPoint { key: string; value: number }
export interface Achievement { id: string; title: string; desc: string; earned: boolean; progress?: number }
export interface Challenge { id: string; title: string; unit: string; value: number; target: number }

export interface Stats {
  xp: number;
  todayXp: number;
  level: number;
  levelName: string;
  levelFloor: number;
  levelNext: number;
  focus: { todayMin: number; todaySessions: number; weekMin: number; lastWeekMin: number; totalMin: number; totalSessions: number; streak: number; days: DayPoint[]; byHour: number[] };
  workouts: { total: number; thisWeek: number; lastWeek: number; weekStreak: number; pushupBest: number; days: DayPoint[] };
  breath: { todayMin: number; weekMin: number; totalMin: number; days: DayPoint[] };
  sleep: { streak: number; last14: number };
  meds: { streak: number; adherence14: number };
  symptoms: { key: string; belch?: number; heartburn?: number }[];
  tasks: { doneToday: number; doneWeek: number; doneTotal: number };
  checksToday: number;
  achievements: Achievement[];
  challenges: Challenge[];
}

const LEVELS: [number, string][] = [
  [1, 'Rookie'], [3, 'Operator'], [5, 'Builder'], [8, 'Strategist'], [12, 'Director'],
  [16, 'Executive'], [20, 'Visionary'], [25, 'Titan'], [30, 'Legend'],
];
export const xpForLevel = (n: number) => 50 * (n - 1) * n;

export function levelOf(xp: number) {
  let n = 1;
  while (xpForLevel(n + 1) <= xp) n++;
  const name = [...LEVELS].reverse().find(([l]) => n >= l)?.[1] || 'Rookie';
  return { level: n, name, floor: xpForLevel(n), next: xpForLevel(n + 1) };
}

/** Monday-based week start for a day key. */
export function weekStart(key: string): string {
  const wd = weekday(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

const TASK_XP = { 1: 10, 2: 20, 3: 40 } as const;

export function computeStats(logs: Record<string, MonthLog>, tasks: Record<string, Task>, plan: Plan | null, today: string, rollover: number): Stats {
  const days = new Map<string, { checks: number; focus: number; sessions: number; breath: number; workouts: number; lightsOut: boolean; medsOk: boolean; xp: number }>();
  const get = (k: string) => {
    let d = days.get(k);
    if (!d) days.set(k, (d = { checks: 0, focus: 0, sessions: 0, breath: 0, workouts: 0, lightsOut: false, medsOk: false, xp: 0 }));
    return d;
  };
  const byHour = new Array(24).fill(0);
  let pushupBest = 0;
  const symptoms: Stats['symptoms'] = [];
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
      d.xp += checks.length * 5 + (d.lightsOut ? 15 : 0);
      if (dl.symptoms && (dl.symptoms.belch != null || dl.symptoms.heartburn != null))
        symptoms.push({ key: k, belch: dl.symptoms.belch, heartburn: dl.symptoms.heartburn });
    }
    for (const f of Object.values(m.focus || {})) {
      if (f.kind !== 'work') continue;
      const d = get(dayOf(f.start));
      d.focus += f.minutes;
      d.sessions += 1;
      d.xp += Math.round(f.minutes);
      byHour[new Date(f.start).getHours()] += f.minutes;
    }
    for (const b of Object.values(m.breath || {})) {
      const d = get(dayOf(b.start));
      d.breath += b.minutes;
      d.xp += Math.round(b.minutes);
    }
    for (const w of Object.values(m.workouts || {})) {
      const d = get(dayOf(w.start));
      d.workouts += 1;
      d.xp += 60;
      for (const s of w.exercises.pushup || []) if (s.level >= 3 && (s.reps || 0) > pushupBest) pushupBest = s.reps || 0;
    }
  }
  let doneTotal = 0;
  for (const t of Object.values(tasks)) {
    if (t.status !== 'done' || !t.doneAt) continue;
    doneTotal++;
    get(dayOf(t.doneAt)).xp += TASK_XP[t.impact] ?? 10;
  }

  const xp = [...days.values()].reduce((a, d) => a + d.xp, 0);
  const lv = levelOf(xp);
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
  const sleepWeek = sumRange(ws, today, (d) => (d.lightsOut ? 1 : 0));

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
  const bestFocusDay = Math.max(0, ...allDays.map((d) => d.sessions));
  const sleepStreak = streak((k) => !!days.get(k)?.lightsOut);
  const medsStreak = streak((k) => !!days.get(k)?.medsOk);
  const focusStreak = streak((k) => (days.get(k)?.focus || 0) >= 50);
  const doneWeek = Object.values(tasks).filter((x) => x.status === 'done' && x.doneAt && dayOf(x.doneAt) >= ws).length;
  const doneToday = Object.values(tasks).filter((x) => x.status === 'done' && x.doneAt && dayOf(x.doneAt) === today).length;

  const ach = (id: string, title: string, desc: string, value: number, target: number): Achievement => ({
    id, title, desc, earned: value >= target, progress: Math.min(1, target ? value / target : 0),
  });
  const achievements = [
    ach('focus1', 'First Focus', 'จบ Pomodoro แรก', totalSessions, 1),
    ach('focus100', 'Centurion', 'Pomodoro ครบ 100 รอบ', totalSessions, 100),
    ach('deepday', 'Deep Day', 'Pomodoro 8 รอบในวันเดียว', bestFocusDay, 8),
    ach('wk1', 'First Sweat', 'จบการออกกำลังกายครั้งแรก', totalWorkouts, 1),
    ach('wk36', 'Quarter Strong', 'ออกกำลังกายครบ 36 ครั้ง (3 เดือน)', totalWorkouts, 36),
    ach('push20', 'Push 20', 'วิดพื้นเต็มท่า 20 ครั้งในเซ็ตเดียว', pushupBest, 20),
    ach('push30', 'Push 30', 'วิดพื้นเต็มท่า 30 ครั้งในเซ็ตเดียว', pushupBest, 30),
    ach('breath600', 'Calm Core', 'ฝึกหายใจสะสม 600 นาที', totalBreath, 600),
    ach('sleep7', 'Night Owl Tamed', 'ปิดไฟตรงเวลา 7 วันติด', sleepStreak, 7),
    ach('sleep30', 'Circadian Pro', 'ปิดไฟตรงเวลา 30 วันติด', sleepStreak, 30),
    ach('meds14', 'Clockwork', 'กินยาครบทุกมื้อ 14 วันติด', medsStreak, 14),
    ach('tasks50', 'Closer', 'ปิดงานครบ 50 งาน', doneTotal, 50),
    ach('level10', 'Double Digits', 'ถึงเลเวล 10', lv.level, 10),
  ];

  const challenges: Challenge[] = [
    { id: 'focus', title: focusLast > 0 ? "Beat last week's focus" : 'Focus 10 hours', unit: 'min', value: focusWeek, target: focusLast > 0 ? Math.ceil((focusLast * 1.1) / 25) * 25 : 600 },
    { id: 'workouts', title: '3 workouts this week', unit: 'sessions', value: wkThis, target: 3 },
    { id: 'breath', title: 'Breathing 150 min', unit: 'min', value: breathWeek, target: 150 },
    { id: 'sleep', title: 'Lights out on time 7/7', unit: 'nights', value: sleepWeek, target: 7 },
  ];

  return {
    xp,
    todayXp: t?.xp || 0,
    level: lv.level,
    levelName: lv.name,
    levelFloor: lv.floor,
    levelNext: lv.next,
    focus: { todayMin: t?.focus || 0, todaySessions: t?.sessions || 0, weekMin: focusWeek, lastWeekMin: focusLast, totalMin: totalFocus, totalSessions, streak: focusStreak, days: series(84, (k) => days.get(k)?.focus || 0), byHour },
    workouts: { total: totalWorkouts, thisWeek: wkThis, lastWeek: wkLast, weekStreak, pushupBest, days: series(84, (k) => days.get(k)?.workouts || 0) },
    breath: { todayMin: t?.breath || 0, weekMin: breathWeek, totalMin: totalBreath, days: series(14, (k) => days.get(k)?.breath || 0) },
    sleep: { streak: sleepStreak, last14 },
    meds: { streak: medsStreak, adherence14: meds14 / 14 },
    symptoms: symptoms.sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-30),
    tasks: { doneToday, doneWeek, doneTotal },
    checksToday: t?.checks || 0,
    achievements,
    challenges,
  };
}

export const monthKeyNow = (today: string) => monthOf(today);
export const dayDate = keyToDate;
