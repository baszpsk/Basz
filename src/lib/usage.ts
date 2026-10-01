// จดช่วงที่ Basz OS อยู่บนหน้าจอ เก็บไว้ในเครื่องนี้ 5 วัน
// ใช้เดาเวลาวางมือถือตอนกลางคืนและเวลาเริ่มใช้ตอนเช้า (ดู sleeplog.ts)
// จดเฉพาะอุปกรณ์จอสัมผัส เพราะคอมที่เปิดแอปค้างไว้จะดูเหมือนใช้ทั้งคืน
// ระหว่างเปิดอยู่จะต่อเวลาทุก 1 นาที ถ้า iOS หยุดหน้าเว็บโดยไม่ส่งสัญญาณ เวลาจบจะคลาดไม่เกินราว 1 นาที

export type Session = [start: number, end: number];

const KEY = 'bz1:usage';
const SINCE = 'bz1:usage-since';
const KEEP_MS = 5 * 86400000;
const BEAT_MS = 60000;
/** เปิดกลับมาภายในเวลานี้ถือว่าใช้ต่อเนื่องช่วงเดิม */
const JOIN_MS = 2 * 60000;

const valid = (x: unknown): x is Session =>
  Array.isArray(x) && x.length === 2 && typeof x[0] === 'number' && typeof x[1] === 'number' && x[1] >= x[0];

function load(): Session[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    return [];
  }
}

let sessions: Session[] = [];
let open: Session | null = null;
let started = false;
let tracking = false;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    /* ที่เก็บในเครื่องเต็มหรือถูกปิด: ข้ามไป ไม่กระทบส่วนอื่นของแอป */
  }
}

function begin(now: number) {
  const last = sessions[sessions.length - 1];
  if (last && now >= last[1] && now - last[1] <= JOIN_MS) open = last;
  else {
    open = [now, now];
    sessions.push(open);
  }
  open[1] = now;
  const cut = now - KEEP_MS;
  sessions = sessions.filter((s) => s[1] >= cut || s === open);
  save();
}

function beat(now: number) {
  if (!open) begin(now);
  else {
    open[1] = now;
    save();
  }
}

function end(now: number) {
  if (open) {
    open[1] = Math.max(open[1], now);
    save();
  }
  open = null;
}

const touchDevice = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

export function startUsage() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (!touchDevice()) return;
  tracking = true;
  try {
    if (!localStorage.getItem(SINCE)) localStorage.setItem(SINCE, String(Date.now()));
  } catch {
    /* ไม่มีที่เก็บในเครื่อง */
  }
  sessions = load();
  const visible = () => document.visibilityState === 'visible';
  if (visible()) begin(Date.now());
  document.addEventListener('visibilitychange', () => (visible() ? begin(Date.now()) : end(Date.now())));
  window.addEventListener('pagehide', () => end(Date.now()));
  window.addEventListener('pageshow', () => visible() && begin(Date.now()));
  window.setInterval(() => visible() && beat(Date.now()), BEAT_MS);
}

/** เวลาที่เครื่องนี้เริ่มจด หรือ null ถ้าเครื่องนี้ไม่จด (ไม่ใช่จอสัมผัส หรือไม่มีที่เก็บ) */
export function usageSince(): number | null {
  if (!tracking) return null;
  try {
    const v = Number(localStorage.getItem(SINCE));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** ช่วงที่จดไว้ในเครื่องนี้ เรียงจากเก่าไปใหม่ */
export function usageSessions(): Session[] {
  return (started ? sessions : load()).map((s) => [s[0], s[1]] as Session).sort((a, b) => a[0] - b[0]);
}
