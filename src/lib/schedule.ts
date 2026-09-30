// Builds the day: fixed routine blocks (sleep, meds, meals, trading, training)
// from the settings and the personal plan, then tasks are slotted into the
// work blocks by priority.

import { programForDay } from '../content/exercises';
import { LOADS } from '../content/laundry';
import { caffeineCutoff } from './sleepcoach';
import { fmtHM, parseHM, weekday } from './time';
import type { Area, DayLog, Med, Plan, Settings } from './types';

export interface CheckItem { id: string; label: string; hint?: string; kind: 'med' | 'habit' | 'food' | 'care' | 'trade' | 'home' }
export type BlockKind = 'wake' | 'trade' | 'meal' | 'work' | 'move' | 'break' | 'evening' | 'wind' | 'sleep' | 'home' | 'review';
export type BlockAction = 'focus' | 'workout' | 'breath' | 'walk' | 'laundry' | 'plan' | 'checkin';

export interface Block {
  id: string;
  start: number;
  end: number;
  title: string;
  sub?: string;
  kind: BlockKind;
  area?: Area;
  items?: CheckItem[];
  action?: BlockAction;
  accepts?: Area[];
  program?: string;
  loads?: string[];
}

const ALL_WORK: Area[] = ['seoulful', 'health', 'growth', 'home', 'personal'];

/** Med times may be absolute ('09:00') or anchored ('@meal1-45', '@lightsOut-45'). */
export function medMinutes(m: Med, st: Settings): number {
  const R = st.rolloverHour;
  const t = m.time.trim();
  if (!t.startsWith('@')) return parseHM(t, R);
  const match = /^@(wake|meal1|meal2|lightsOut)([+-]\d+)?$/.exec(t);
  if (!match) return parseHM(st.wake, R);
  const base = parseHM(st[match[1] as 'wake' | 'meal1' | 'meal2' | 'lightsOut'], R);
  return base + (match[2] ? Number(match[2]) : 0);
}

export function buildDay(key: string, st: Settings, plan: Plan | null, log?: DayLog, prevLog?: DayLog): Block[] {
  const R = st.rolloverHour;
  const wd = weekday(key);
  const W = parseHM(st.wake, R);
  const M1 = parseHM(st.meal1, R);
  const M2 = parseHM(st.meal2, R);
  const L = parseHM(st.lightsOut, R);
  const WO = parseHM(st.workoutTime, R);
  const trading = st.tradingDays.includes(wd);
  const nightOut = !!log?.nightOut;
  const recovery = !!prevLog?.nightOut;
  const program = programForDay(wd, st.workoutDays);
  const loads = LOADS.filter((l) => l.day === wd);
  const out: Block[] = [];
  const add = (b: Block) => b.end > b.start && out.push(b);

  // On trading days a late wake-up leaves only minutes before the 09:40
  // orders, so daylight and skincare move to right after the open.
  const ORDERS = parseHM('09:40', R);
  const squeeze = trading && W < ORDERS && W + 20 > ORDERS;
  const fresh: CheckItem[] = [
    { id: 'light', label: 'รับแสงแดด 5–10 นาที', hint: 'เปิดม่านหรือออกไปรับแสงจริง ช่วยตั้งนาฬิกาชีวิต', kind: 'habit' },
    { id: 'skin-am', label: 'ล้างหน้า + ทากันแดด', hint: 'คลีนเซอร์อ่อน → มอยส์เจอไรเซอร์ → กันแดดยาว 2 นิ้ว', kind: 'care' },
    { id: 'checkin', label: 'เช็คอินเช้า 2 ตัวเลข', hint: 'ยาลดกรดที่กินเพิ่มเมื่อวาน · ตื่นเพราะแสบร้อน ไอ หรือสำลักเมื่อคืน ตอบในแอปหรือในแชทก็ได้', kind: 'habit' },
  ];
  add({
    id: 'wake',
    start: W,
    end: squeeze ? ORDERS : W + 20,
    kind: 'wake',
    title: recovery ? 'เช้าพักฟื้น' : 'ตื่นนอน',
    sub: recovery ? 'ตื่นไม่เกิน 13:00 · รับแสงแดดทันที · ห้ามงีบหลัง 16:00' : squeeze ? 'ยา · น้ำ · เปิดแผนเทรดที่ทำไว้' : 'ยา · น้ำ · แสงแดด · กันแดด',
    area: 'health',
    action: squeeze ? undefined : 'checkin',
    items: [
      { id: 'water', label: 'ดื่มน้ำ 1 แก้ว', hint: 'น้ำเปล่า 1 แก้ว จิบช้าๆ ไม่ดื่มรวดเดียว', kind: 'habit' },
      ...(squeeze ? [] : fresh),
      ...(recovery ? [{ id: 'recover', label: 'ดื่มน้ำ + กินมื้อเบาๆ', hint: 'น้ำ + อาหารย่อยง่ายไม่มัน ไม่ต้องทดแทนการนอนด้วยการงีบยาว', kind: 'habit' as const }] : []),
    ],
  });

  if (trading) {
    const reviewStart = Math.max(W + 20, parseHM('09:20', R));
    if (reviewStart < parseHM('09:40', R))
      add({ id: 'trade-review', start: reviewStart, end: parseHM('09:40', R), kind: 'trade', area: 'trading', title: 'ทบทวนแผนเทรด', sub: 'เปิดแผนที่ทำไว้เมื่อวาน ไม่ตัดสินใจใหม่ตอนเพิ่งตื่น' });
    add({
      id: 'trade-orders', start: parseHM('09:40', R), end: parseHM('09:55', R), kind: 'trade', area: 'trading', title: 'ส่งคำสั่งซื้อขาย', sub: 'ช่วง Pre-open 09:40–09:55',
      items: [{ id: 'orders', label: 'ส่งคำสั่งตามแผนแล้ว', hint: 'ส่งตามแผนเท่านั้น ถ้าจะเปลี่ยนแผนให้จดเหตุผล', kind: 'trade' }],
    });
    add({ id: 'trade-open', start: parseHM('10:00', R), end: parseHM('10:20', R), kind: 'trade', area: 'trading', title: 'ดูตลาดเปิด', sub: 'ดูไม่เกิน 30 นาที แล้วปิดจอ' });
    if (squeeze) {
      const fs = parseHM('10:20', R);
      const fe = Math.min(M1, fs + 15);
      if (fe - fs >= 5) add({ id: 'fresh', start: fs, end: fe, kind: 'wake', area: 'health', title: 'เริ่มวันให้สดชื่น', sub: 'รับแสงจริง 5–10 นาที · ล้างหน้า + กันแดด · เช็คอินเช้า', action: 'checkin', items: fresh });
      else {
        out[0].items = [...(out[0].items || []), ...fresh];
        out[0].action = 'checkin';
      }
    }
  } else {
    add({ id: 'slow', start: W + 20, end: M1, kind: 'break', title: 'เช้าสบายๆ', sub: 'ตลาดปิด · เวลาของคุณเอง' });
  }

  add({
    id: 'meal1', start: M1, end: M1 + 30, kind: 'meal', area: 'health', title: 'มื้อแรก', sub: 'โปรตีน ≥30 g · กินช้าๆ ไม่คุยตอนเคี้ยว',
    items: [{ id: 'protein1', label: 'โปรตีน ≥30 g', hint: 'ไข่ 2–3 ฟอง หรืออกไก่/ปลา/เต้าหู้ ขนาดฝ่ามือ', kind: 'food' }],
  });
  add({
    id: 'coffee', start: M1 + 30, end: M1 + 45, kind: 'break', area: 'health', title: 'กาแฟ · หายใจท้อง', sub: 'กาแฟ 1 แก้วหลังอาหาร + หายใจท้อง 15 นาที', action: 'breath',
    items: [{ id: 'coffee', label: 'กาแฟ 1 แก้ว', hint: 'หลังอาหารเท่านั้น คาเฟอีนแก้วสุดท้ายก่อน ' + caffeineCutoff(st) + ' (12 ชม. ก่อนปิดไฟ)', kind: 'food' }, { id: 'breath-am', label: 'หายใจท้อง 15 นาที', kind: 'habit' }],
  });

  let cursor = M1 + 45;
  if (loads.length && !nightOut) {
    add({
      id: 'laundry', start: cursor, end: cursor + 15, kind: 'home', area: 'home', title: 'เริ่มซักผ้า', sub: loads.map((l) => l.name).join(' + '), action: 'laundry', loads: loads.map((l) => l.id),
    });
    cursor += 15;
  }
  const breakBefore = WO - 15;
  add({ id: 'deep1', start: cursor, end: breakBefore, kind: 'work', area: 'seoulful', title: 'ทำงานแบบโฟกัส', sub: 'งานสำคัญที่สุดของวันก่อน · ทำทีละงาน', action: 'focus', accepts: ALL_WORK });
  add({ id: 'prep', start: breakBefore, end: WO, kind: 'break', title: program ? 'เตรียมวอร์มอัพ' : 'พัก', sub: program ? 'เปลี่ยนชุด ปูเสื่อ เติมน้ำ' : 'ลุกเดิน ยืดตัว' });

  const moveEnd = program ? WO + 50 : WO + 30;
  if (program)
    add({ id: 'workout', start: WO, end: moveEnd, kind: 'move', area: 'health', title: `ออกกำลังกาย ${program.id}`, sub: program.focus, action: 'workout', program: program.id });
  else
    add({ id: 'walk', start: WO, end: moveEnd, kind: 'move', area: 'health', title: 'เดินเร็ว 30 นาที', sub: 'เดินเร็วแบบพอพูดได้แต่ร้องเพลงไม่ได้', action: 'walk', items: [{ id: 'walk30', label: 'เดิน 30 นาที', kind: 'habit' }] });

  add({ id: 'snack', start: moveEnd, end: moveEnd + 15, kind: 'meal', area: 'health', title: 'ของว่างโปรตีน', sub: '≥20 g เช่น นมถั่วเหลืองโปรตีนสูง ไข่ต้ม 2 ฟอง', items: [{ id: 'protein2', label: 'ของว่างโปรตีน ≥20 g', kind: 'food' }] });

  const deep2End = trading ? parseHM('16:30', R) : M2 - 15;
  add({ id: 'deep2', start: moveEnd + 15, end: deep2End, kind: 'work', area: 'seoulful', title: trading ? 'ทำงานแบบโฟกัส' : 'ร้านและเวลาส่วนตัว', sub: trading ? 'งานร้าน · งานพัฒนา · ตอบเรื่องค้าง' : 'งานร้านแบบเบาๆ หรือเวลาส่วนตัว', action: 'focus', accepts: ALL_WORK });

  if (trading)
    add({
      id: 'homework', start: parseHM('16:35', R), end: M2 - 15, kind: 'trade', area: 'trading', title: 'การบ้านเทรด', sub: 'หลังตลาดปิด · เตรียมคำสั่งของพรุ่งนี้ให้เสร็จ', action: 'focus', accepts: ['trading'],
      items: [{ id: 'hw', label: 'คำสั่งของพรุ่งนี้พร้อมแล้ว', hint: 'พรุ่งนี้เช้าแค่ส่งตามแผน', kind: 'trade' }],
    });

  add({
    id: 'meal2', start: M2 - 15, end: M2 + 40, kind: 'meal', area: 'health', title: 'มื้อเย็น', sub: `มื้อสุดท้ายของวัน · ไขมันต่ำ · ครัวปิด ${fmtHM(L - 180)}`,
    items: [{ id: 'protein3', label: 'โปรตีน ≥30 g ไขมันต่ำ', hint: 'ย่าง/ต้ม/นึ่ง ดีกว่าทอด ลดหมูสามชั้นมื้อเย็น', kind: 'food' }],
  });
  add({ id: 'walkbreath', start: M2 + 40, end: M2 + 60, kind: 'move', area: 'health', title: 'เดิน + หายใจท้อง', sub: 'เดินเบาๆ 10 นาที แล้วนั่งหายใจท้อง · ห้ามนอนราบ 3 ชม.', action: 'breath', items: [{ id: 'walk-pm', label: 'เดินเบาๆ 10 นาที', kind: 'habit' }, { id: 'breath-pm', label: 'หายใจท้อง 15 นาที', kind: 'habit' }] });

  const eveEnd = L - 120;
  if (nightOut) {
    add({
      id: 'nightout', start: M2 + 60, end: L, kind: 'evening', title: 'เที่ยวกลางคืน', sub: 'คืนนี้เที่ยว · ดูแลตัวเองตามนี้',
      items: [
        { id: 'no-fat', label: 'กินมื้อหลักไขมันต่ำก่อนดื่ม', kind: 'food' },
        { id: 'no-water', label: 'น้ำเปล่า 1 แก้ว ต่อเหล้า 1 แก้ว', kind: 'habit' },
        { id: 'no-limit', label: 'ไม่เกิน 4 แก้ว · งดเบียร์ งดผสมโซดา', hint: 'แก๊สทำให้เรอและกรดไหลย้อน', kind: 'habit' },
        { id: 'no-stop', label: 'หยุดดื่มก่อนนอนอย่างน้อย 3 ชม.', kind: 'habit' },
        { id: 'no-meds', label: 'ยาก่อนนอน: ทำตามที่หมอสั่งสำหรับคืนที่ดื่ม', hint: 'ยาก่อนนอนบางตัวห้ามใช้ร่วมกับแอลกอฮอล์ ทำตามที่หมอบอก', kind: 'med' },
        { id: 'no-ride', label: 'กลับบ้านปลอดภัย ไม่ขับเอง', kind: 'habit' },
      ],
    });
  } else {
    if (wd === 0) add({ id: 'weekly', start: M2 + 60, end: M2 + 105, kind: 'review', title: 'ทบทวนสัปดาห์', sub: 'ดูสถิติสัปดาห์ · วางงานใหญ่ของสัปดาห์หน้า', action: 'plan' });
    add({ id: 'evening', start: wd === 0 ? M2 + 105 : M2 + 60, end: eveEnd, kind: 'evening', area: 'seoulful', title: 'ช่วงค่ำ', sub: 'เช็คยอดขาย/รีวิวร้าน · งานเบาๆ · เวลาครอบครัว', accepts: ['seoulful', 'personal', 'home', 'growth'], items: [{ id: 'biz-check', label: 'เช็คยอดขายและรีวิววันนี้', kind: 'habit' }] });
    add({ id: 'plan', start: eveEnd, end: L - 90, kind: 'review', title: 'วางแผนพรุ่งนี้', sub: 'เลือก 3 เรื่องที่สำคัญที่สุดของพรุ่งนี้', action: 'plan', items: [{ id: 'top3', label: 'เลือก 3 งานสำคัญของพรุ่งนี้', kind: 'habit' }] });
    add({
      id: 'wind', start: L - 90, end: L - 30, kind: 'wind', area: 'health', title: 'ผ่อนคลายก่อนนอน', sub: 'หรี่ไฟ · วางมือถือ · ทำตามลำดับ',
      items: [
        { id: 'dim', label: 'หรี่ไฟ วางมือถือ', kind: 'habit' },
        { id: 'skin-pm', label: 'บำรุงผิวก่อนนอน', hint: 'ล้างหน้า → ยาทาสิว/เรตินอยด์ ขนาดเม็ดถั่ว → มอยส์เจอไรเซอร์', kind: 'care' },
        { id: 'teeth', label: 'แปรงฟัน 2 นาที + ไหมขัดฟัน', kind: 'care' },
      ],
    });
  }
  add({
    id: 'read', start: L - 30, end: L, kind: 'wind', area: 'health', title: 'อ่านหนังสือ · หายใจ', sub: 'นั่งนอกเตียง แสงสลัว หายใจท้อง 10 นาที · ครบเวลาแล้วขึ้นเตียง ปิดไฟ นอนตะแคงซ้าย', action: 'breath',
    items: [{ id: 'breath-night', label: 'หายใจท้อง 10 นาที', kind: 'habit' }, { id: 'lights-out', label: 'ปิดไฟตรงเวลา', kind: 'habit' }],
  });
  add({ id: 'sleep', start: L, end: W + 1440, kind: 'sleep', area: 'health', title: 'การนอน', sub: 'ถ้า 20 นาทียังไม่หลับ ลุกไปนั่งที่แสงสลัว ง่วงแล้วค่อยกลับเตียง' });

  out.sort((a, b) => a.start - b.start);

  // Place each medicine in the block that covers its time (or the next one).
  for (const m of plan?.meds || []) {
    if (m.days && !m.days.includes(wd)) continue;
    const t = medMinutes(m, st);
    if (nightOut && t >= L - 90) continue; // drinking night: the doctor's rule item replaces night meds
    const b = out.find((x) => x.kind !== 'sleep' && t >= x.start && t < x.end) || out.find((x) => x.kind !== 'sleep' && x.start >= t);
    if (!b) continue;
    const item: CheckItem = { id: 'med-' + m.id, label: m.name, hint: m.note, kind: 'med' };
    b.items = t <= b.start + 5 ? [item, ...(b.items || [])] : [...(b.items || []), item];
  }
  return out;
}

export function currentBlock(blocks: Block[], nowMin: number): { now?: Block; next?: Block } {
  const now = blocks.find((b) => nowMin >= b.start && nowMin < b.end);
  const next = blocks.find((b) => b.start > nowMin && b.kind !== 'sleep');
  return { now, next };
}

export function allItems(blocks: Block[]): CheckItem[] {
  return blocks.flatMap((b) => b.items || []);
}
