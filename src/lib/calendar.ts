// ปฏิทินของงาน: งานที่ลงวันที่ไว้ (ถ้ามีเวลาคือนัด) วันที่ต้องตามงานคนอื่น
// และงานที่เสร็จแล้วในวันที่กำหนดไว้ ไม่มีอะไรเก็บแยก ทุกอย่างมาจากงานจริง

import { daysBetween, pad, todayKey } from './time';
import type { Task } from './types';

export interface CalItem {
  task: Task;
  /** due = วันที่กำหนดของงาน · follow = วันที่ต้องตามงานคนอื่น */
  kind: 'due' | 'follow';
  day: string;
  time?: string;
  done: boolean;
  /** เลยมากี่วันแล้ว (0 = ยังไม่เลย) */
  overdue: number;
}

const order = (a: CalItem, b: CalItem) =>
  Number(a.done) - Number(b.done) || Number(!a.time) - Number(!b.time) || (a.time || '').localeCompare(b.time || '') || b.task.impact - a.task.impact;

export function calendarItems(tasks: Record<string, Task>, today: string, rollover: number): Map<string, CalItem[]> {
  const map = new Map<string, CalItem[]>();
  const put = (x: CalItem) => {
    const list = map.get(x.day);
    if (list) list.push(x);
    else map.set(x.day, [x]);
  };
  for (const t of Object.values(tasks)) {
    if (t.status === 'dropped') continue;
    const done = t.status === 'done';
    if (t.due) {
      const day = t.due.slice(0, 10);
      put({ task: t, kind: 'due', day, time: t.due.length > 10 ? t.due.slice(11, 16) : undefined, done, overdue: !done && day < today ? daysBetween(day, today) : 0 });
    }
    if (t.status === 'waiting' && t.followUpAt) {
      const at = new Date(t.followUpAt);
      const day = todayKey(at, rollover);
      put({ task: t, kind: 'follow', day, time: `${pad(at.getHours())}:${pad(at.getMinutes())}`, done: false, overdue: day < today ? daysBetween(day, today) : 0 });
    }
  }
  for (const list of map.values()) list.sort(order);
  return map;
}

/** รายการของวันหนึ่ง ถ้าเป็นวันนี้ งานที่เลยกำหนดและยังไม่เสร็จจะขึ้นบนสุด */
export function dayItems(map: Map<string, CalItem[]>, day: string, today: string): CalItem[] {
  const own = map.get(day) || [];
  if (day !== today) return own;
  const late: CalItem[] = [];
  for (const [k, list] of map) if (k < today) for (const x of list) if (x.overdue > 0) late.push(x);
  late.sort((a, b) => b.overdue - a.overdue);
  return [...late, ...own];
}
