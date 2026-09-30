// High-level operations the screens call. Each one writes through the store,
// so it shows up instantly and syncs in the background.

import { LAUNDRY_STEPS, LOADS } from '../content/laundry';
import { store, type Meta } from './store';
import { dateKey, monthOf, pad, todayKey, uid } from './time';
import type { BreathSession, DayLog, FocusSession, Settings, ShopItem, Task, WorkoutSession } from './types';

const R = () => store.s.settings.rolloverHour;
const dayOfTs = (ts: number) => todayKey(new Date(ts), R());

export function patchDay(date: string, patch: DayLog) {
  store.write(`logs/${monthOf(date)}`, { kind: 'merge', data: { days: { [date]: patch } } });
}

export function setCheck(date: string, itemId: string, on: boolean) {
  patchDay(date, { checks: { [itemId]: on ? Date.now() : null } });
}

function addToMonth(kind: 'focus' | 'workouts' | 'breath', start: number, entry: object) {
  store.write(`logs/${monthOf(dayOfTs(start))}`, { kind: 'merge', data: { [kind]: { [uid()]: entry } } });
}
/** A fixed id per round, so two open devices finishing the same round write it once. */
export function logFocusSession(id: string, s: FocusSession) {
  store.write(`logs/${monthOf(dayOfTs(s.start))}`, { kind: 'merge', data: { focus: { [id]: s } } });
}
export const logWorkout = (s: WorkoutSession) => addToMonth('workouts', s.start, s);
export const logBreath = (s: BreathSession) => addToMonth('breath', s.start, s);

export function saveSettings(patch: Partial<Settings>) {
  store.write('cfg/settings', { kind: 'merge', data: patch as Record<string, unknown> });
}
export function saveMeta(patch: Partial<Meta>) {
  store.write('cfg/meta', { kind: 'merge', data: patch as Record<string, unknown> });
}

export function newTask(p: Partial<Task>): Task {
  return { id: uid(), title: '', area: 'seoulful', impact: 2, status: 'todo', createdAt: Date.now(), source: 'manual', ...p };
}

export function saveTask(t: Task) {
  store.write(`tasks/${t.id}`, { kind: 'set', data: { ...t, updatedAt: Date.now() } as unknown as Record<string, unknown> });
}

export function deleteTask(id: string) {
  store.write(`tasks/${id}`, { kind: 'delete' });
}

const localIso = (ts: number) => {
  const d = new Date(ts);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function completeTask(t: Task) {
  const now = Date.now();
  saveTask({ ...t, status: 'done', doneAt: now });
  if (t.repeatDays && t.repeatDays > 0) {
    const next = now + t.repeatDays * 86400000;
    saveTask(newTask({ ...t, id: uid(), status: 'todo', createdAt: now, doneAt: undefined, notBefore: next - 12 * 3600000, due: dateKey(new Date(next)), subtasks: t.subtasks?.map((s) => ({ ...s, done: false })) }));
  }
  if (t.flow?.id === 'laundry') nextLaundryStep(t, now);
}

export function reopenTask(t: Task) {
  saveTask({ ...t, status: 'todo', doneAt: undefined });
}

export function delegate(t: Task, person: string, days: number) {
  saveTask({ ...t, status: 'waiting', waitingOn: person, followUpAt: Date.now() + days * 86400000, followUps: 0 });
}
export function followedUp(t: Task, days = 2) {
  saveTask({ ...t, followUpAt: Date.now() + days * 86400000, followUps: (t.followUps || 0) + 1 });
}
export function backFromWaiting(t: Task) {
  saveTask({ ...t, status: 'todo', waitingOn: undefined, followUpAt: undefined });
}
export function snooze(t: Task, minutes: number) {
  saveTask({ ...t, notBefore: Date.now() + minutes * 60000, due: t.flow ? localIso(Date.now() + minutes * 60000) : t.due });
}

// ---------- Laundry flow ----------
export function startLaundry(loadIds: string[]) {
  const run = uid();
  for (const id of loadIds) {
    const load = LOADS.find((l) => l.id === id);
    if (!load) continue;
    saveTask(newTask({
      title: `${LAUNDRY_STEPS[0].title} · ${load.name}`,
      notes: `${load.what}\n${load.program}\n${LAUNDRY_STEPS[0].th}`,
      area: 'home',
      impact: 2,
      estimateMin: 5,
      due: localIso(Date.now()),
      flow: { id: 'laundry', run: `${run}:${id}`, step: 0 },
      source: 'flow',
    }));
  }
}

function nextLaundryStep(t: Task, now: number) {
  const step = (t.flow?.step ?? 0) + 1;
  if (step >= LAUNDRY_STEPS.length || !t.flow) return;
  const loadId = t.flow.run.split(':')[1];
  const load = LOADS.find((l) => l.id === loadId);
  if (!load) return;
  const s = store.s;
  const delay = step === 1 ? s.meta.flowDurations?.[loadId] ?? load.cycleMin : step === 2 ? s.settings.dryHours * 60 : 0;
  const at = now + delay * 60000;
  saveTask(newTask({
    title: `${LAUNDRY_STEPS[step].title} · ${load.name}`,
    notes: LAUNDRY_STEPS[step].th,
    area: 'home',
    impact: 2,
    estimateMin: step === 3 ? 10 : 5,
    notBefore: at,
    due: localIso(at),
    flow: { ...t.flow, step },
    source: 'flow',
  }));
}

export function setCycleMinutes(loadId: string, minutes: number) {
  saveMeta({ flowDurations: { ...(store.s.meta.flowDurations || {}), [loadId]: minutes } });
}

// ---------- Shopping ----------
export function saveShop(item: ShopItem) {
  store.write(`shop/${item.id}`, { kind: 'set', data: item as unknown as Record<string, unknown> });
}

export function markSeen(ids: string[]) {
  const seen = { ...(store.s.meta.seen || {}) };
  const now = Date.now();
  ids.forEach((id) => (seen[id] = now));
  saveMeta({ seen });
}
