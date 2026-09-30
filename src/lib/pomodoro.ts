// Pomodoro 25/5. The round in progress lives in cfg/meta, so a reload, a
// locked phone or a second device picks it up where it was. Time comes from
// timestamps, never from counting ticks, and a round that ran out while the
// app was closed is recorded as ending at the moment it ran out.
// พักยาวหลังครบรอบเต็มตามจำนวนที่ตั้ง (ค่าเริ่มต้น 15 นาทีหลัง 4 รอบ ตามกติกาต้นฉบับของ Cirillo
// และหลักฐานทางอ้อมในรายงาน) ชุดนับเฉพาะรอบที่ครบ และถ้าว่างเกินหนึ่งชั่วโมงก่อนเริ่มรอบใหม่ถือเป็นชุดใหม่

import { logFocusSession, saveMeta } from './actions';
import { store } from './store';
import type { FocusSession, Pomo } from './types';

export const IDLE: Pomo = { phase: 'idle', running: false, phaseStart: null, resumedAt: null, accSec: 0, plannedSec: 0, pauses: [], taskId: null, label: null, area: null };

/** Focus rounds shorter than this are dropped: a mis-tap, not work. */
export const MIN_WORK_SEC = 60;
/** ว่างนานกว่านี้ก่อนเริ่มรอบใหม่ ถือเป็นชุดใหม่ */
const NEW_SET_GAP_MS = 60 * 60000;

export type Link = Pick<Pomo, 'taskId' | 'label' | 'area'>;
export const NO_LINK: Link = { taskId: null, label: null, area: null };

export const current = (): Pomo => ({ ...IDLE, ...(store.s.meta.pomo || {}) });
const write = (p: Pomo) => saveMeta({ pomo: p });
const linkOf = (p: Pomo): Link => ({ taskId: p.taskId, label: p.label, area: p.area });

/** ค่าตั้งของตัวจับเวลา เติมค่าพักยาวให้ค่าตั้งเดิมที่ยังไม่มี */
export function focusCfg() {
  const f = store.s.settings.focus;
  return { ...f, longRest: f.longRest ?? 15, longEvery: f.longEvery ?? 4 };
}

export function activeSec(p: Pomo, now = Date.now()): number {
  return p.accSec + (p.running && p.resumedAt ? Math.max(0, (now - p.resumedAt) / 1000) : 0);
}
export const remainingSec = (p: Pomo, now = Date.now()) => Math.max(0, p.plannedSec - activeSec(p, now));
/** When a running round runs out; null while paused or idle. */
export const endsAt = (p: Pomo) => (p.phase !== 'idle' && p.running && p.resumedAt ? p.resumedAt + (p.plannedSec - p.accSec) * 1000 : null);

/** สถานะว่างหลังจบรอบ เก็บงานที่ผูก จำนวนรอบในชุด และเวลาจบไว้ */
const idleAfter = (p: Pomo, end: number, set = p.set || 0): Pomo => ({ ...IDLE, ...linkOf(p), set, lastEnd: end });

function round(phase: 'work' | 'break', t: number, link: Link, set: number, long = false): Pomo {
  const f = focusCfg();
  const min = phase === 'work' ? f.work : long ? f.longRest : f.rest;
  const p: Pomo = { ...IDLE, ...link, phase, running: true, phaseStart: t, resumedAt: t, plannedSec: min * 60, set };
  if (long) p.long = true;
  return p;
}

/** Writes the finished round to that day's log. Returns false when a focus round was too short to keep. */
function record(p: Pomo, end: number, endedBy: NonNullable<FocusSession['endedBy']>): boolean {
  if (p.phase === 'idle' || !p.phaseStart) return false;
  const active = Math.min(p.plannedSec, activeSec(p, end));
  if (p.phase === 'work' && active < MIN_WORK_SEC) return false;
  const pauses = p.pauses.map((x) => ({ s: x.s, e: x.e ?? end }));
  const s: FocusSession = {
    start: p.phaseStart,
    end,
    minutes: Math.round(active / 60),
    kind: p.phase,
    plannedSec: p.plannedSec,
    activeSec: Math.round(active),
    completed: endedBy === 'timer',
    endedBy,
    pauses,
    pausedSec: Math.round(pauses.reduce((a, x) => a + Math.max(0, x.e - x.s), 0) / 1000),
  };
  if (p.phase === 'break' && p.long) s.long = true;
  if (p.phase === 'work' && p.taskId) Object.assign(s, { taskId: p.taskId, label: p.label || undefined, area: p.area || undefined });
  // A fixed id per round, so two open devices closing the same round write it once.
  logFocusSession((p.phase === 'work' ? 'w' : 'b') + p.phaseStart, s);
  return true;
}

/** Starts a focus round now. A rest in progress ends as skipped. */
export function startWork(link?: Link) {
  const p = current();
  if (p.phase === 'work') return;
  const now = Date.now();
  if (p.phase === 'break') record(p, now, 'skip');
  const fresh = p.phase === 'idle' && (!p.lastEnd || now - p.lastEnd > NEW_SET_GAP_MS);
  write(round('work', now, link || linkOf(p), fresh ? 0 : p.set || 0));
}

/** เริ่มพักทันทีโดยไม่ต้องรอโฟกัสครบ ทั้งจากตอนว่างและกลางรอบโฟกัส รอบโฟกัสที่ถูกตัดจะบันทึกว่าหยุดเพื่อพัก คืน false เมื่อรอบนั้นสั้นกว่า 1 นาทีจนไม่บันทึก */
export function startBreak(link?: Link): boolean {
  const p = current();
  if (p.phase === 'break') return true;
  const now = Date.now();
  const kept = p.phase === 'work' ? record(p, now, 'break') : true;
  write(round('break', now, link || linkOf(p), p.set || 0));
  return kept;
}

export function pause() {
  const p = current();
  if (p.phase === 'idle' || !p.running) return;
  const now = Date.now();
  write({ ...p, running: false, resumedAt: null, accSec: activeSec(p, now), pauses: [...p.pauses, { s: now, e: null }] });
}

export function resume() {
  const p = current();
  if (p.phase === 'idle' || p.running) return;
  const now = Date.now();
  write({ ...p, running: true, resumedAt: now, pauses: p.pauses.map((x) => (x.e == null ? { s: x.s, e: now } : x)) });
}

/** Ends the round early. Returns false when the focus round was too short to keep. */
export function stop(): boolean {
  const p = current();
  if (p.phase === 'idle') return true;
  const now = Date.now();
  const kept = record(p, now, 'stop');
  write(idleAfter(p, now));
  return kept || p.phase === 'break';
}

export function setLink(link: Link) {
  write({ ...current(), ...link });
}

/** Closes every round that has run out by `now`, oldest first, and returns their phases. */
export function sync(now = Date.now()): ('work' | 'break')[] {
  let p = current();
  const f = focusCfg();
  const done: ('work' | 'break')[] = [];
  for (let i = 0; i < 3; i++) {
    const end = endsAt(p);
    if (end == null || now < end || p.phase === 'idle') break;
    record(p, end, 'timer');
    done.push(p.phase);
    if (p.phase === 'work') {
      // รอบครบนับเข้าชุด ครบชุดแล้วพักยาวและเริ่มนับชุดใหม่
      const set = (p.set || 0) + 1;
      const long = set >= f.longEvery;
      p = f.autoBreak ? round('break', end, linkOf(p), long ? 0 : set, long) : idleAfter(p, end, long ? 0 : set);
    } else {
      p = idleAfter(p, end);
    }
  }
  if (done.length) write(p);
  return done;
}
