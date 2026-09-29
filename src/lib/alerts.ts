// In-app notifications, derived from state: due flow steps, follow-ups,
// overdue tasks, meds not taken, a sleep-window change the coach suggests,
// a monthly backup reminder, and new items Claude put into the digests.

import { isActionable } from './priority';
import type { Block } from './schedule';
import { BACKUP_EVERY_DAYS } from './backup';
import { sleepAdvice } from './sleepcoach';
import type { State } from './store';
import { dueToTs, monthOf } from './time';
import type { DigestItem, Task } from './types';

export interface Alert {
  id: string;
  kind: 'flow' | 'followup' | 'overdue' | 'med' | 'sleep' | 'backup' | 'digest';
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
    else if (t.status === 'waiting') out.push({ id: 'fu-' + t.id, kind: 'followup', title: `ตามงานจาก ${t.waitingOn || 'อีกฝ่าย'}`, body: t.title, task: t });
    else if (t.due && dueToTs(t.due, R) < ts) out.push({ id: 'od-' + t.id, kind: 'overdue', title: t.title, body: 'เลยกำหนด', task: t });
  }
  // Medicines from blocks that already ended (the current block shows its own).
  for (const b of blocks) {
    if (b.end > nowMin || nowMin - b.end > 180) continue;
    for (const it of b.items || []) {
      if (it.kind === 'med' && !checks[it.id]) out.push({ id: 'med-' + today + it.id, kind: 'med', title: `ยังไม่ได้ติ๊ก: ${it.label}`, body: it.hint || b.title, urgent: true });
    }
  }
  const sa = sleepAdvice((day) => s.logs[monthOf(day)]?.days?.[day], s.settings, today, s.meta.sleepWindowFrom);
  if (sa.next) {
    out.push({
      id: `sleep-${today}-${sa.next}`,
      kind: 'sleep',
      title: sa.action === 'earlier' ? `นอนนานขึ้น: ปิดไฟ ${sa.next}` : `หลับลึกขึ้น: ปิดไฟ ${sa.next}`,
      body: `จากเช็คอิน ${sa.nights} คืนล่าสุด · แตะเพื่อดูเหตุผลและยืนยัน`,
    });
  }
  const loggedDays = Object.values(s.logs).reduce((n, m) => n + Object.keys(m.days || {}).length, 0);
  const lastBackup = s.meta.lastBackupAt || 0;
  if (loggedDays >= 7 && ts - lastBackup > BACKUP_EVERY_DAYS * 86400000) {
    out.push({ id: 'backup-' + monthOf(today), kind: 'backup', title: 'บันทึกไฟล์สำรองข้อมูลของคุณ', body: 'ไฟล์เดียว เก็บลง iCloud Drive ไว้อีกชุด เดือนละครั้ง' });
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
