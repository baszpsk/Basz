// In-app notifications, derived from state: due flow steps, follow-ups,
// overdue tasks, meds not taken, and new items Claude put into the digests.

import { isActionable } from './priority';
import type { Block } from './schedule';
import type { State } from './store';
import { dueToTs } from './time';
import type { DigestItem, Task } from './types';

export interface Alert {
  id: string;
  kind: 'flow' | 'followup' | 'overdue' | 'med' | 'digest';
  title: string;
  body?: string;
  task?: Task;
  item?: DigestItem;
  date?: string;
  urgent?: boolean;
}

export function computeAlerts(s: State, now: Date, today: string, blocks: Block[], nowMin: number, checks: Record<string, number | null> = {}): Alert[] {
  const out: Alert[] = [];
  const ts = now.getTime();
  const R = s.settings.rolloverHour;
  for (const t of Object.values(s.tasks)) {
    if (!isActionable(t, ts)) continue;
    if (t.flow) out.push({ id: 'flow-' + t.id, kind: 'flow', title: t.title, body: t.notes?.split('\n').pop(), task: t, urgent: true });
    else if (t.status === 'waiting') out.push({ id: 'fu-' + t.id, kind: 'followup', title: `Follow up with ${t.waitingOn || 'them'}`, body: t.title, task: t });
    else if (t.due && dueToTs(t.due, R) < ts) out.push({ id: 'od-' + t.id, kind: 'overdue', title: t.title, body: 'Overdue', task: t });
  }
  // Medicines from blocks that already ended (the current block shows its own).
  for (const b of blocks) {
    if (b.end > nowMin || nowMin - b.end > 180) continue;
    for (const it of b.items || []) {
      if (it.kind === 'med' && !checks[it.id]) out.push({ id: 'med-' + today + it.id, kind: 'med', title: `Not ticked: ${it.label}`, body: it.hint || b.title, urgent: true });
    }
  }
  const seen = s.meta.seen || {};
  const digests = Object.values(s.digests).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);
  for (const d of digests) {
    for (const it of Object.values(d.items || {})) {
      const id = `dg-${d.date}-${it.id}`;
      if (seen[id]) continue;
      out.push({ id, kind: 'digest', title: it.title, body: it.body, item: it, date: d.date, urgent: it.priority === 'high' });
    }
  }
  return out.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
}
