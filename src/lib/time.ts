// Time helpers. The app thinks in "logical days": a day runs from the
// rollover hour (06:00) to the next rollover, so 00:30 lights-out still
// belongs to the evening before.

export const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function logicalDate(now: Date, rolloverHour: number): Date {
  const d = new Date(now);
  if (d.getHours() < rolloverHour) d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function todayKey(now: Date, rolloverHour: number): string {
  return dateKey(logicalDate(now, rolloverHour));
}

/** Minutes since midnight of the logical day (values past 1440 are after midnight). */
export function logicalMinutes(now: Date, rolloverHour: number): number {
  const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return now.getHours() < rolloverHour ? m + 1440 : m;
}

export function parseHM(hm: string, rolloverHour = 6): number {
  const [h, m] = hm.split(':').map(Number);
  const v = (h || 0) * 60 + (m || 0);
  return h < rolloverHour ? v + 1440 : v;
}

export function fmtHM(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}

export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + n);
  return dateKey(dt);
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const weekday = (key: string) => keyToDate(key).getDay();
export const monthOf = (key: string) => key.slice(0, 7);

export function daysBetween(a: string, b: string): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86400000);
}

/** Timestamp for HH:mm on a logical day key. */
export function tsAt(key: string, hm: string, rolloverHour = 6): number {
  const d = keyToDate(key);
  const mins = parseHM(hm, rolloverHour);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + mins * 60000;
}

export function tsAtMinutes(key: string, mins: number): number {
  const d = keyToDate(key);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + mins * 60000;
}

const WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const WD_LONG = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const wdName = (i: number) => WD[i];

export function fmtDayLong(key: string): string {
  const d = keyToDate(key);
  return `วัน${WD_LONG[d.getDay()]}ที่ ${d.getDate()} ${MO[d.getMonth()]}`;
}

export function fmtShortDate(key: string): string {
  const d = keyToDate(key);
  return `${d.getDate()} ${MO[d.getMonth()]}`;
}

export function relTime(ts: number, now: number): string {
  const diff = Math.round((ts - now) / 60000);
  const abs = Math.abs(diff);
  const txt = abs < 1 ? 'ตอนนี้' : abs < 60 ? `${abs} นาที` : abs < 1440 ? `${Math.round(abs / 60)} ชม.` : `${Math.round(abs / 1440)} วัน`;
  if (txt === 'ตอนนี้') return txt;
  return diff > 0 ? `อีก ${txt}` : `${txt}ที่แล้ว`;
}

export function dueToTs(due: string, rolloverHour = 6): number {
  if (due.includes('T')) {
    const [k, hm] = due.split('T');
    return tsAt(k, hm, rolloverHour);
  }
  return tsAt(due, '23:59', 0);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
