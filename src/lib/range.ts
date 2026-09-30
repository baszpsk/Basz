// ช่วงเวลาของหน้าสถิติ ทุกช่วงนับเป็นวันตามตรรกะของแอป (วันเปลี่ยนตอนเวลาเปลี่ยนวัน 06:00)
// สัปดาห์เริ่มวันจันทร์ เดือน ไตรมาส และปีตามปฏิทิน ทุกช่วงเทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน
// ถ้าช่วงนี้ยังไม่จบ ช่วงก่อนหน้าจะนับแค่ถึงจุดเดียวกัน เพื่อให้แข่งกับตัวเองอย่างยุติธรรม

import { addDays, daysBetween, fmtShortDate, keyToDate, pad, wdName, weekday } from './time';

export type RangeKind = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';

export const RANGE_OPTIONS: { id: RangeKind; label: string }[] = [
  { id: 'day', label: 'วัน' },
  { id: 'week', label: 'สัปดาห์' },
  { id: 'month', label: 'เดือน' },
  { id: 'quarter', label: 'ไตรมาส' },
  { id: 'year', label: 'ปี' },
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'custom', label: 'กำหนดเอง' },
];

/** ช่วงที่เลือก: anchor คือวันใดก็ได้ในช่วง (ใช้เลื่อนย้อนหรือไปข้างหน้า) ส่วน from และ to ใช้กับกำหนดเอง */
export interface RangeSel {
  kind: RangeKind;
  anchor: string;
  from: string;
  to: string;
}

export type Unit = 'hour' | 'day' | 'week' | 'month';

export interface Bucket {
  key: string;
  /** ชื่อเต็มในกล่องตัวเลข */
  label: string;
  /** ป้ายสั้นใต้แกน */
  tick: string;
  from: string;
  to: string;
  /** ชั่วโมงของวัน (เฉพาะช่วงวัน) */
  hour?: number;
  /** ยังมาไม่ถึง */
  future: boolean;
}

export interface Compare {
  from: string;
  to: string;
  /** วันสุดท้ายที่นับ ถ้าตัดให้ยาวเท่าช่วงนี้จะก่อน to */
  end: string;
  /** เช่น "สัปดาห์ก่อนหน้า" */
  name: string;
  /** เช่น "สัปดาห์ก่อนหน้า ช่วงเดียวกัน" เมื่อตัดให้ยาวเท่าช่วงนี้ */
  label: string;
  partial: boolean;
}

export interface Period {
  kind: RangeKind;
  from: string;
  to: string;
  /** วันสุดท้ายที่เกิดขึ้นแล้ว (ไม่เกินวันนี้) */
  end: string;
  days: number;
  /** จำนวนวันที่ผ่านไปแล้วในช่วง */
  elapsed: number;
  title: string;
  dates: string;
  current: boolean;
  canBack: boolean;
  canNext: boolean;
  prev?: Compare;
  unit: Unit;
  buckets: Bucket[];
}

const MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MO_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const yearOf = (k: string) => Number(k.slice(0, 4));
const monthIdx = (k: string) => Number(k.slice(5, 7)) - 1;
const minKey = (a: string, b: string) => (a < b ? a : b);
const maxKey = (a: string, b: string) => (a > b ? a : b);

export function addMonths(key: string, n: number): string {
  const d = new Date(yearOf(key), monthIdx(key) + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
export const weekStart = (k: string) => addDays(k, -((weekday(k) + 6) % 7));
const monthStart = (k: string) => k.slice(0, 8) + '01';
const quarterStart = (k: string) => `${yearOf(k)}-${pad(Math.floor(monthIdx(k) / 3) * 3 + 1)}-01`;
const yearStart = (k: string) => `${yearOf(k)}-01-01`;

function bounds(kind: 'day' | 'week' | 'month' | 'quarter' | 'year', k: string): [string, string] {
  if (kind === 'day') return [k, k];
  if (kind === 'week') {
    const s = weekStart(k);
    return [s, addDays(s, 6)];
  }
  const s = kind === 'month' ? monthStart(k) : kind === 'quarter' ? quarterStart(k) : yearStart(k);
  return [s, addDays(addMonths(s, kind === 'month' ? 1 : kind === 'quarter' ? 3 : 12), -1)];
}

/** วันกับเดือนแบบสั้น ใส่ปีเมื่อไม่ใช่ปีนี้ */
function short(k: string, today: string) {
  return yearOf(k) === yearOf(today) ? fmtShortDate(k) : `${fmtShortDate(k)} ${yearOf(k)}`;
}
function spanText(from: string, to: string, today: string) {
  if (from === to) return `${wdName(weekday(from))} ${short(from, today)}`;
  if (monthIdx(from) === monthIdx(to) && yearOf(from) === yearOf(to)) return `${keyToDate(from).getDate()}–${short(to, today)}`;
  return `${short(from, today)} – ${short(to, today)}`;
}

export function defaultSel(kind: RangeKind, today: string): RangeSel {
  return { kind, anchor: today, from: addDays(today, -29), to: today };
}

/** เลื่อนช่วงไปก่อนหน้า (-1) หรือถัดไป (1) */
export function shiftSel(sel: RangeSel, dir: 1 | -1): RangeSel {
  const a = sel.anchor;
  const k = sel.kind;
  const anchor = k === 'day' ? addDays(a, dir) : k === 'week' ? addDays(a, 7 * dir) : k === 'month' ? addMonths(a, dir) : k === 'quarter' ? addMonths(a, 3 * dir) : k === 'year' ? addMonths(a, 12 * dir) : a;
  return { ...sel, anchor };
}

function unitFor(kind: RangeKind, days: number): Unit {
  if (kind === 'day') return 'hour';
  if (kind === 'week' || kind === 'month') return 'day';
  if (kind === 'quarter') return 'week';
  if (kind === 'year') return 'month';
  return days <= 31 ? 'day' : days <= 182 ? 'week' : 'month';
}

export function bucketsOf(unit: Unit, from: string, to: string, today: string, rollover: number, now: Date): Bucket[] {
  const out: Bucket[] = [];
  if (unit === 'hour') {
    // วันตามตรรกะเริ่มที่ชั่วโมงเปลี่ยนวัน แกนจึงเริ่ม 06:00 และจบ 05:00 ของอีกวัน
    const nowIdx = from === today ? (now.getHours() - rollover + 24) % 24 : from < today ? 23 : -1;
    for (let i = 0; i < 24; i++) {
      const h = (rollover + i) % 24;
      out.push({ key: `${from}T${pad(h)}`, label: `${pad(h)}:00–${pad((h + 1) % 24)}:00`, tick: pad(h), from, to: from, hour: h, future: i > nowIdx });
    }
    return out;
  }
  if (unit === 'day') {
    for (let k = from; k <= to; k = addDays(k, 1)) {
      out.push({ key: k, label: `${wdName(weekday(k))} ${short(k, today)}`, tick: daysBetween(from, to) < 7 ? wdName(weekday(k)) : String(keyToDate(k).getDate()), from: k, to: k, future: k > today });
    }
    return out;
  }
  if (unit === 'week') {
    for (let s = weekStart(from); s <= to; s = addDays(s, 7)) {
      const bf = maxKey(s, from);
      const bt = minKey(addDays(s, 6), to);
      out.push({ key: bf, label: spanText(bf, bt, today), tick: fmtShortDate(bf), from: bf, to: bt, future: bf > today });
    }
    return out;
  }
  for (let s = monthStart(from); s <= to; s = addMonths(s, 1)) {
    const bf = maxKey(s, from);
    const bt = minKey(addDays(addMonths(s, 1), -1), to);
    const y = yearOf(s) === yearOf(today) ? '' : ` ${yearOf(s)}`;
    out.push({ key: bf, label: `${MO_LONG[monthIdx(s)]}${y}`, tick: MO[monthIdx(s)], from: bf, to: bt, future: bf > today });
  }
  return out;
}

/** ช่วงที่เลือกให้เป็นวันจริง พร้อมชื่อ ช่วงเทียบ และช่องย่อยของกราฟ first คือวันแรกที่มีบันทึก */
export function periodOf(sel: RangeSel, today: string, first: string | undefined, rollover: number, now: Date): Period {
  const start = first && first < today ? first : today;
  let from: string;
  let to: string;
  if (sel.kind === 'all') {
    from = start;
    to = today;
  } else if (sel.kind === 'custom') {
    from = minKey(sel.from, sel.to);
    to = minKey(maxKey(sel.from, sel.to), today);
    if (from > to) from = to;
  } else {
    [from, to] = bounds(sel.kind, minKey(sel.anchor, today));
  }
  const end = minKey(to, today);
  const days = daysBetween(from, to) + 1;
  const elapsed = daysBetween(from, end) + 1;
  const current = from <= today && today <= to;

  let prev: Compare | undefined;
  if (sel.kind !== 'all') {
    let pf: string;
    let pt: string;
    let name: string;
    if (sel.kind === 'custom') {
      pt = addDays(from, -1);
      pf = addDays(pt, -(days - 1));
      name = `${days} วันก่อนหน้า`;
    } else {
      [pf, pt] = bounds(sel.kind, addDays(from, -1));
      name = { day: from === today ? 'เมื่อวาน' : 'วันก่อนหน้า', week: 'สัปดาห์ก่อนหน้า', month: 'เดือนก่อนหน้า', quarter: 'ไตรมาสก่อนหน้า', year: 'ปีก่อนหน้า' }[sel.kind];
    }
    const partial = current && end < to;
    const pend = partial ? minKey(pt, addDays(pf, elapsed - 1)) : pt;
    prev = { from: pf, to: pt, end: pend, name, label: partial ? `${name} ช่วงเดียวกัน` : name, partial };
  }

  const yesterday = addDays(today, -1);
  const q = Math.floor(monthIdx(from) / 3) + 1;
  const thisYear = yearOf(from) === yearOf(today);
  const title = {
    day: from === today ? 'วันนี้' : from === yesterday ? 'เมื่อวาน' : `${wdName(weekday(from))} ${short(from, today)}`,
    week: current ? 'สัปดาห์นี้' : to === addDays(weekStart(today), -1) ? 'สัปดาห์ก่อน' : `สัปดาห์ ${short(from, today)}`,
    month: current ? 'เดือนนี้' : `${MO_LONG[monthIdx(from)]}${thisYear ? '' : ` ${yearOf(from)}`}`,
    quarter: current ? `ไตรมาสนี้ (Q${q})` : `Q${q}${thisYear ? '' : ` ${yearOf(from)}`}`,
    year: current ? `ปีนี้ (${yearOf(from)})` : `ปี ${yearOf(from)}`,
    all: 'ทั้งหมด',
    custom: 'ช่วงที่เลือก',
  }[sel.kind];
  const left = current && end < to ? ` · ผ่านไป ${elapsed} จาก ${days} วัน` : '';
  const dates = sel.kind === 'all' ? `ตั้งแต่ ${short(from, today)} · ${days} วัน` : sel.kind === 'day' ? spanText(from, from, today) : `${spanText(from, to, today)}${left}`;

  const unit = unitFor(sel.kind, days);
  const fixed = sel.kind !== 'all' && sel.kind !== 'custom';
  return {
    kind: sel.kind,
    from,
    to,
    end,
    days,
    elapsed,
    title,
    dates,
    current,
    canBack: fixed && !!first && from > first,
    canNext: fixed && to < today,
    prev,
    unit,
    buckets: bucketsOf(unit, from, to, today, rollover, now),
  };
}

/** เวลาเริ่มของวันตามตรรกะ (เป็นมิลลิวินาที) */
export function dayStartTs(key: string, rollover: number): number {
  const d = keyToDate(key);
  d.setHours(rollover, 0, 0, 0);
  return d.getTime();
}
