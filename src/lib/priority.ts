// Deterministic, explainable task ranking. Runs instantly on the device;
// Claude can refine the order on request, but the app never waits for it.

import type { Block } from './schedule';
import { daysBetween, dueToTs } from './time';
import type { Area, Task } from './types';

export interface Ranked {
  task: Task;
  score: number;
  reasons: string[];
  followUp?: boolean;
}

const IMPACT = { 1: 8, 2: 22, 3: 40 } as const;
const AREA_W: Record<Area, number> = { health: 10, seoulful: 8, trading: 6, growth: 5, home: 4, personal: 4 };

export function isActionable(t: Task, now: number): boolean {
  if (t.status === 'done' || t.status === 'dropped') return false;
  if (t.notBefore && t.notBefore > now) return false;
  if (t.status === 'waiting') return !!t.followUpAt && t.followUpAt <= now;
  return true;
}

export function rankTasks(tasks: Task[], now: number, today: string, rollover: number): Ranked[] {
  const out: Ranked[] = [];
  for (const t of tasks) {
    if (!isActionable(t, now)) continue;
    const reasons: string[] = [];
    let s = IMPACT[t.impact] ?? 8;
    if (t.impact === 3) reasons.push('High impact');
    s += AREA_W[t.area] ?? 4;
    if (t.pinned) {
      s += 100;
      reasons.push('Pinned');
    }
    if (t.due) {
      const dueDay = t.due.slice(0, 10);
      const d = daysBetween(today, dueDay);
      const overdueTs = dueToTs(t.due, rollover) < now;
      if (d < 0 || (d === 0 && overdueTs && t.due.includes('T'))) {
        s += 45 + Math.min(20, Math.abs(d) * 4);
        reasons.push(d < 0 ? `Overdue ${Math.abs(d)} d` : 'Overdue');
      } else if (d === 0) {
        s += 35;
        reasons.push('Due today');
      } else if (d === 1) {
        s += 20;
        reasons.push('Due tomorrow');
      } else if (d <= 3) {
        s += 12;
        reasons.push(`Due in ${d} d`);
      } else if (d <= 7) s += 6;
    }
    const est = t.estimateMin ?? 25;
    if (est <= 15) {
      s += 6;
      reasons.push('Quick win');
    }
    const ageDays = Math.floor((now - t.createdAt) / 86400000);
    s += Math.min(10, Math.max(0, ageDays));
    const followUp = t.status === 'waiting';
    if (followUp) {
      s = 30 + (IMPACT[t.impact] ?? 8) + Math.min(15, (t.followUps || 0) * 5);
      reasons.unshift(`Follow up · ${t.waitingOn || 'someone'}`);
    }
    if (t.flow) {
      s += 50;
      reasons.unshift('Next step');
    }
    out.push({ task: t, score: s, reasons, followUp });
  }
  return out.sort((a, b) => b.score - a.score || a.task.createdAt - b.task.createdAt);
}

export interface Slot { task: Task; start: number; end: number; reasons: string[] }

/** Fill the remaining time of today's work blocks with ranked tasks. */
export function slotTasks(blocks: Block[], ranked: Ranked[], nowMin: number, manualOrder?: string[]): Record<string, Slot[]> {
  const res: Record<string, Slot[]> = {};
  let queue = ranked.filter((r) => !r.task.flow);
  if (manualOrder?.length) {
    const pos = new Map(manualOrder.map((id, i) => [id, i]));
    queue = [...queue].sort((a, b) => (pos.get(a.task.id) ?? 999) - (pos.get(b.task.id) ?? 999) || b.score - a.score);
  }
  const used = new Set<string>();
  for (const b of blocks) {
    if (!b.accepts || b.end <= nowMin) continue;
    let t = Math.max(b.start, nowMin);
    const list: Slot[] = [];
    for (const r of queue) {
      if (used.has(r.task.id) || !b.accepts.includes(r.task.area)) continue;
      const est = Math.max(10, r.task.estimateMin ?? 25);
      if (t + Math.min(est, 25) > b.end) continue;
      list.push({ task: r.task, start: t, end: Math.min(b.end, t + est), reasons: r.reasons });
      used.add(r.task.id);
      t += est;
      if (t >= b.end) break;
    }
    if (list.length) res[b.id] = list;
  }
  return res;
}

export const AREA_LABEL: Record<Area, string> = {
  health: 'Health',
  seoulful: 'Seoulful',
  trading: 'Trading',
  home: 'Home',
  growth: 'Growth',
  personal: 'Personal',
};
