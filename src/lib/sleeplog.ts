// หาช่วงนอนของคืนหนึ่งจากช่วงที่เปิดใช้ Basz OS (usage.ts)
// กฎมาจากงานวิจัยที่เดาเวลานอนจากการใช้มือถือ (รายงาน "ติดตามการนอนจากการใช้ iPhone"):
// - รวมการใช้ที่ห่างกันไม่ถึง 5 นาทีเป็นช่วงเดียว
// - หาช่วงที่ไม่ได้เปิดแอปยาวที่สุด ในหน้าต่าง 19:00 ของเมื่อวานถึง 15:00 ของวันตื่น
// - ถามเจ้าของเมื่อช่วงนั้นสั้นกว่า 4 ชม. ถูกตัดเป็นสองท่อน ห่างจากแผนเกิน 2 ชม. หรือไม่รู้หัวหรือท้าย
// แอปรู้แค่การใช้ Basz OS ถ้าปิดแอปแล้วใช้แอปอื่นต่อ เวลาวางมือถือที่ได้จะเร็วกว่าความจริง

import type { DayLog, MonthLog, SleepGuess, SleepPick, SleepRec } from './types';
import { addDays, dateKey, keyToDate, monthOf, pad } from './time';
import type { Session } from './usage';

export type AskReason = 'none' | 'short' | 'split' | 'odd' | 'evening' | 'morning';
export interface Span {
  bed: number;
  wake: number;
}
export interface Night {
  bed?: number;
  wake?: number;
  reasons: AskReason[];
  /** ช่วงเงียบอื่นที่ยาวพอจะเป็นการนอน และรู้ทั้งหัวและท้าย */
  alt: Span[];
  /** ถ้าการนอนถูกตัดเป็นสองท่อน: ช่วงรวมตั้งแต่ท่อนแรกถึงท่อนหลัง */
  merged?: Span;
}

const MIN = 60000;
const JOIN = 5 * MIN;
const CANDIDATE = 120 * MIN;
const SHORT = 240 * MIN;
const ODD = 120 * MIN;
const SPLIT_USE = 30 * MIN;
/** ช่วงที่ยาวกว่านี้ไม่ใช่การนอนคืนเดียว ใช้ตรวจเวลาที่เจ้าของกรอกเอง */
export const MAX_NIGHT = 16 * 60 * MIN;

/** เวลาเริ่มและจบของหน้าต่างที่ใช้หาการนอนของคืนก่อนวันตื่น */
export function nightWindow(wakeDate: string): [number, number] {
  const s = keyToDate(addDays(wakeDate, -1));
  s.setHours(19, 0, 0, 0);
  const e = keyToDate(wakeDate);
  e.setHours(15, 0, 0, 0);
  return [s.getTime(), e.getTime()];
}

/** เวลา HH:MM ของคืนก่อนวันตื่น: ตั้งแต่เที่ยงวันขึ้นไปนับเป็นเมื่อวาน */
export function bedTsAt(wakeDate: string, hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  const d = keyToDate(h >= 12 ? addDays(wakeDate, -1) : wakeDate);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export function wakeTsAt(wakeDate: string, hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  const d = keyToDate(wakeDate);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export const hmOf = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const useWithin = (uses: Session[], a: number, b: number) =>
  uses.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);

/**
 * from = เวลาที่เครื่องเริ่มจด ถ้าเริ่มกลางหน้าต่าง จะไม่รู้ว่าก่อนหน้านั้นเกิดอะไร
 * จึงคืน null แทนการเดา เมื่อไม่เจอช่วงเงียบ หรือช่วงเงียบหลักอยู่ต้นหน้าต่าง
 */
export function detectNight(sessions: Session[], wakeDate: string, now: number, plan: { lightsOut: string; wake: string }, from?: number): Night | null {
  const [w0, we] = nightWindow(wakeDate);
  const ws = Math.max(w0, from ?? w0);
  const partial = ws > w0;
  if (now <= ws) return null;
  const end = Math.min(we, now);
  const uses: Session[] = [];
  for (const [a, b] of [...sessions].sort((x, y) => x[0] - y[0])) {
    if (b < ws || a > end) continue;
    const s: Session = [Math.max(a, ws), Math.min(b, end)];
    const last = uses[uses.length - 1];
    if (last && s[0] - last[1] < JOIN) last[1] = Math.max(last[1], s[1]);
    else uses.push(s);
  }
  if (!uses.length) return null;

  // ช่วงเงียบระหว่างการใช้แต่ละครั้ง ช่วงต้นหน้าต่างถ้าตอนค่ำไม่ได้เปิดแอป และช่วงท้ายถ้าเลย 15:00 แล้วยังไม่เปิด
  type Gap = Span & { head?: boolean; tail?: boolean };
  const gaps: Gap[] = [];
  if (uses[0][0] - ws >= CANDIDATE) gaps.push({ bed: ws, wake: uses[0][0], head: true });
  for (let i = 1; i < uses.length; i++) gaps.push({ bed: uses[i - 1][1], wake: uses[i][0] });
  const lastUse = uses[uses.length - 1][1];
  if (now >= we && we - lastUse >= CANDIDATE) gaps.push({ bed: lastUse, wake: we, tail: true });
  const cands = gaps.filter((g) => g.wake - g.bed >= CANDIDATE).sort((a, b) => b.wake - b.bed - (a.wake - a.bed));
  // ก่อน 15:00 ยังมีโอกาสเจอช่วงนอนที่ยังไม่จบ จึงยังไม่สรุปว่าไม่เจอ
  if (!cands.length) return partial || now < we ? null : { reasons: ['none'], alt: [] };

  const main = cands[0];
  if (partial && main.head) return null;
  const reasons: AskReason[] = [];
  if (main.head) reasons.push('evening');
  if (main.tail) reasons.push('morning');
  if (main.wake - main.bed < SHORT) reasons.push('short');

  const alt: Span[] = [];
  let merged: Span | undefined;
  for (const g of cands.slice(1)) {
    if (!g.head && !g.tail) alt.push({ bed: g.bed, wake: g.wake });
    const [first, second] = g.bed < main.bed ? [g, main] : [main, g];
    if (!merged && !first.head && !second.tail && useWithin(uses, first.wake, second.bed) <= SPLIT_USE) merged = { bed: first.bed, wake: second.wake };
  }
  if (merged) reasons.push('split');

  const planBed = bedTsAt(wakeDate, plan.lightsOut);
  const planWake = wakeTsAt(wakeDate, plan.wake);
  if ((!main.head && Math.abs(main.bed - planBed) > ODD) || (!main.tail && Math.abs(main.wake - planWake) > ODD)) reasons.push('odd');

  return { bed: main.head ? undefined : main.bed, wake: main.tail ? undefined : main.wake, reasons, alt, merged };
}

/** วันตื่นที่ควรสรุปตอนนี้: ก่อนตี 4 ยังถือว่าเป็นกลางคืนของเมื่อคืน */
export function wakeDateFor(now: Date): string | null {
  return now.getHours() >= 4 ? dateKey(now) : null;
}

/** วันตื่นล่าสุดที่คืนก่อนหน้าผ่านไปแล้วบางส่วน ใช้กับหน้าประวัติ */
export const lastWakeDate = (now: Date) => wakeDateFor(now) ?? addDays(dateKey(now), -1);

export function guessOf(n: Night, at: number): SleepGuess {
  return {
    // ใช้ null แทนค่าว่าง เพราะการบันทึกแบบผสานจะข้ามช่องที่ไม่มีค่าแล้วเก็บค่าเก่าไว้
    bed: n.bed !== undefined ? hmOf(n.bed) : null,
    wake: n.wake !== undefined ? hmOf(n.wake) : null,
    bedTs: n.bed ?? null,
    wakeTs: n.wake ?? null,
    ask: n.reasons,
    alt: n.alt,
    merged: n.merged ?? null,
    at,
  };
}

// เทียบด้วยตัวเลขเรียงตามลำดับที่กำหนด ไม่ใช่ลำดับคีย์ที่ได้กลับมาจากคลาวด์ ไม่งั้นจะเขียนค่าเดิมซ้ำทุกนาที
const spanSig = (s?: Span | null) => (s ? [s.bed, s.wake] : null);
const sig = (g?: SleepGuess | null) =>
  JSON.stringify([g?.bedTs ?? null, g?.wakeTs ?? null, [...(g?.ask || [])].sort(), spanSig(g?.merged), (g?.alt || []).map(spanSig)]);

export const sameGuess = (a?: SleepGuess | null, b?: SleepGuess | null) => sig(a) === sig(b);

/** ช่วงที่เจ้าของเลือกหรือกรอกเอง */
export function pickOf(span: Span): SleepPick {
  return { bed: hmOf(span.bed), wake: hmOf(span.wake), bedTs: span.bed, wakeTs: span.wake, skip: false, at: Date.now() };
}

export const skipPick = (): SleepPick => ({ bed: null, wake: null, bedTs: null, wakeTs: null, skip: true, at: Date.now() });

export interface Chosen {
  bed: string | null;
  wake: string | null;
  bedTs: number | null;
  wakeTs: number | null;
  /** auto = แอปเดา · user = เจ้าของเลือก · skip = เจ้าของบอกว่าไม่นับ */
  src: 'auto' | 'user' | 'skip';
  ask: AskReason[];
}

/** ค่าที่ใช้จริงของคืนนั้น: สิ่งที่เจ้าของเลือกมาก่อนเสมอ */
export function chosen(rec?: SleepRec | null): Chosen | null {
  const u = rec?.user;
  if (u) {
    if (u.skip) return { bed: null, wake: null, bedTs: null, wakeTs: null, src: 'skip', ask: [] };
    return { bed: u.bed, wake: u.wake, bedTs: u.bedTs, wakeTs: u.wakeTs, src: 'user', ask: [] };
  }
  const g = rec?.auto;
  if (!g) return null;
  return { bed: g.bed, wake: g.wake, bedTs: g.bedTs, wakeTs: g.wakeTs, src: 'auto', ask: (g.ask || []) as AskReason[] };
}

export const sleepOf = (logs: Record<string, MonthLog>, k: string) => (logs[monthOf(k)]?.days?.[k] as DayLog | undefined)?.sleep;

export interface NightRow {
  key: string;
  bedTs: number;
  wakeTs: number;
  minutes: number;
  src: Chosen['src'];
}

/** คืนที่มีทั้งเวลาวางมือถือและเวลาเริ่มใช้ ย้อนหลัง n วันถึงวันตื่น last */
export function sleepNights(logs: Record<string, MonthLog>, last: string, n = 14): NightRow[] {
  const out: NightRow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = addDays(last, -i);
    const c = chosen(sleepOf(logs, k));
    if (!c || c.src === 'skip' || c.bedTs == null || c.wakeTs == null || c.wakeTs <= c.bedTs) continue;
    out.push({ key: k, bedTs: c.bedTs, wakeTs: c.wakeTs, minutes: Math.round((c.wakeTs - c.bedTs) / MIN), src: c.src });
  }
  return out;
}

/** นาทีที่อยู่บนเตียงตามแผน เช่น ปิดไฟ 00:00 ตื่น 09:30 ได้ 570 นาที */
export function planInBed(lightsOut: string, wake: string): number {
  const mins = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return (((mins(wake) - mins(lightsOut)) % 1440) + 1440) % 1440;
}

/** ค่าเฉลี่ยและส่วนเบี่ยงเบนมาตรฐานของเวลา (นาทีนับจากเที่ยงคืนของวันตื่น) */
export function timeStats(rows: NightRow[], pick: 'bedTs' | 'wakeTs'): { mean: number; sd: number } | null {
  if (!rows.length) return null;
  const xs = rows.map((r) => {
    const mid = keyToDate(r.key);
    mid.setHours(0, 0, 0, 0);
    return (r[pick] - mid.getTime()) / MIN;
  });
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, sd };
}
