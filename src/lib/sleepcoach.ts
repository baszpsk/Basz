// Moves the sleep window the way CBT-I sleep scheduling does: the wake time
// stays fixed and lights-out moves 15 minutes at a time, based on how long
// it took to fall asleep and how long he lay awake in the night.
import { addDays, fmtHM, parseHM } from './time';
import type { DayLog, Settings } from './types';

export interface SleepAdvice {
  /** Nights with both answers since the window last changed (at most 7). */
  nights: number;
  latency: number;
  awake: number;
  inBed: number;
  asleep: number;
  efficiency: number;
  action: 'log' | 'earlier' | 'keep' | 'later' | 'max';
  next?: string;
}

export const MIN_NIGHTS = 5;
const MAX_IN_BED = 600;
const MIN_IN_BED = 480;
const STEP = 15;

/** `logs` maps a logical day to its log; `from` is the day the window last changed. */
export function sleepAdvice(logs: (day: string) => DayLog | undefined, st: Settings, today: string, from?: string): SleepAdvice {
  const R = st.rolloverHour;
  const L = parseHM(st.lightsOut, R);
  const inBed = parseHM(st.wake, R) + 1440 - L;
  const nights: { latency: number; awake: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(today, -i);
    if (from && day <= from) break;
    const s = logs(day)?.sleep;
    if (s?.latency != null && s?.awake != null) nights.push({ latency: s.latency, awake: s.awake });
  }
  const avg = (f: (n: { latency: number; awake: number }) => number) => (nights.length ? nights.reduce((a, n) => a + f(n), 0) / nights.length : 0);
  const latency = Math.round(avg((n) => n.latency));
  const awake = Math.round(avg((n) => n.awake));
  const asleep = Math.max(0, inBed - latency - awake);
  const efficiency = inBed > 0 ? asleep / inBed : 0;
  const base = { nights: nights.length, latency, awake, inBed, asleep, efficiency };
  if (nights.length < MIN_NIGHTS) return { ...base, action: 'log' };
  if (efficiency >= 0.9 && latency <= 20) {
    if (inBed + STEP > MAX_IN_BED) return { ...base, action: 'max' };
    return { ...base, action: 'earlier', next: fmtHM(L - STEP) };
  }
  if (efficiency < 0.8 && inBed - STEP >= MIN_IN_BED) return { ...base, action: 'later', next: fmtHM(L + STEP) };
  return { ...base, action: 'keep' };
}

/** Last caffeine: the stored cut-off, but never later than 12 hours before lights-out. */
export function caffeineCutoff(st: Settings): string {
  const R = st.rolloverHour;
  return fmtHM(Math.min(parseHM(st.coffeeCutoff, R), parseHM(st.lightsOut, R) - 720));
}
