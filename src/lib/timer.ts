// Pomodoro engine. Time is computed from timestamps, so it stays correct when
// the phone locks or the app is in the background. State survives reloads.

import { logFocus } from './actions';
import { store } from './store';
import type { Area } from './types';

export type Mode = 'work' | 'short' | 'long';
export interface TimerState {
  mode: Mode;
  running: boolean;
  startedAt: number;
  elapsedBefore: number; // seconds counted before the last start
  duration: number; // seconds
  cycle: number; // work sessions finished in this set
  taskId?: string;
  taskTitle?: string;
  area?: Area;
}

const KEY = 'bz1:timer';
const listeners = new Set<() => void>();

function load(): TimerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as TimerState;
  } catch {
    /* ignore */
  }
  return { mode: 'work', running: false, startedAt: 0, elapsedBefore: 0, duration: store.s.settings.focus.work * 60, cycle: 0 };
}

export let timer: TimerState = load();

function set(next: TimerState) {
  timer = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export const onTimer = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

export function elapsed(t = timer, now = Date.now()) {
  return t.elapsedBefore + (t.running ? (now - t.startedAt) / 1000 : 0);
}
export const remaining = (t = timer, now = Date.now()) => Math.max(0, t.duration - elapsed(t, now));

const durFor = (m: Mode) => {
  const f = store.s.settings.focus;
  return (m === 'work' ? f.work : m === 'short' ? f.short : f.long) * 60;
};

export function start() {
  if (timer.running) return;
  set({ ...timer, running: true, startedAt: Date.now() });
}
export function pause() {
  if (!timer.running) return;
  set({ ...timer, running: false, elapsedBefore: elapsed() });
}
export function setMode(mode: Mode) {
  set({ ...timer, mode, running: false, startedAt: 0, elapsedBefore: 0, duration: durFor(mode) });
}
export function setTask(taskId?: string, taskTitle?: string, area?: Area) {
  set({ ...timer, taskId, taskTitle, area });
}
export function reset() {
  set({ ...timer, running: false, startedAt: 0, elapsedBefore: 0, duration: durFor(timer.mode) });
}

/** Ends the current session. Returns the finished mode so the UI can celebrate. */
export function finish(completed: boolean): Mode {
  const t = timer;
  const secs = Math.min(elapsed(t), t.duration);
  const end = Date.now();
  if (t.mode === 'work' && secs >= 60) {
    logFocus({ start: end - secs * 1000, end, minutes: Math.round(secs / 60), kind: 'work', taskId: t.taskId, area: t.area, label: t.taskTitle });
  }
  const f = store.s.settings.focus;
  let cycle = t.cycle;
  let next: Mode = 'work';
  if (t.mode === 'work' && completed) {
    cycle += 1;
    next = cycle % f.every === 0 ? 'long' : 'short';
  }
  set({ ...t, mode: next, running: completed && f.autoBreak && next !== 'work', startedAt: Date.now(), elapsedBefore: 0, duration: durFor(next), cycle: next === 'long' || t.mode === 'long' ? (t.mode === 'long' ? 0 : cycle) : cycle });
  return t.mode;
}
