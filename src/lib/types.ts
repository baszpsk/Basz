export type Area = 'health' | 'seoulful' | 'trading' | 'home' | 'growth' | 'personal';
export type TaskStatus = 'todo' | 'waiting' | 'done' | 'dropped';

export interface Subtask { id: string; title: string; done: boolean }

export interface Task {
  id: string;
  title: string;
  notes?: string;
  area: Area;
  /** 1 = nice to have, 2 = matters, 3 = big impact */
  impact: 1 | 2 | 3;
  /** 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm' in local time */
  due?: string;
  /** สถานที่ที่ต้องไป (สำหรับนัด) */
  place?: string;
  estimateMin?: number;
  status: TaskStatus;
  createdAt: number;
  updatedAt?: number;
  doneAt?: number;
  pinned?: boolean;
  /** Delegated / waiting on someone */
  waitingOn?: string;
  followUpAt?: number;
  followUps?: number;
  /** Part of a multi-step flow (laundry, delegation...) */
  flow?: { id: string; run: string; step: number };
  /** Not actionable before this timestamp */
  notBefore?: number;
  subtasks?: Subtask[];
  /** Recurs every N days after completion */
  repeatDays?: number;
  source?: 'manual' | 'ai' | 'claude' | 'flow';
}

export interface Settings {
  wake: string;
  lightsOut: string;
  meal1: string;
  meal2: string;
  workoutTime: string;
  workoutDays: number[];
  rolloverHour: number;
  /** Pomodoro: minutes of focus, minutes of rest, and whether the rest starts by itself. */
  focus: {
    work: number;
    rest: number;
    autoBreak: boolean;
    /** นาทีของพักยาว */
    longRest?: number;
    /** พักยาวหลังครบกี่รอบ */
    longEvery?: number;
  };
  coffeeCutoff: string;
  dryHours: number;
  proteinTarget: number;
  breathTargetMin: number;
  stepsTarget: number;
  tradingDays: number[];
}

export interface Med { id: string; time: string; name: string; note?: string; days?: number[] }

export interface Guide {
  id: string;
  title: string;
  summary: string;
  points: string[];
  evidence?: string;
  sources?: { label: string; url: string }[];
}

export interface Plan {
  aiContext?: string;
  meds: Med[];
  guides?: Guide[];
  doctorQuestions: { id: string; q: string; why?: string }[];
  links: { id: string; label: string; url: string; kind: 'maps' | 'delivery' | 'booking' }[];
  profile: { name: string; birth: string; heightCm: number; weightKg: number };
  notes?: string;
  /** คำแนะนำที่ขึ้นระหว่างพักของ Pomodoro: พักสั้น พักยาว และพักที่ตรงกับช่วงหลังอาหาร */
  breakTips?: { short?: string[]; long?: string[]; afterMeal?: string[] };
}

/** ช่วงนอนที่แอปเดาจากการเปิดปิด Basz OS (ดู sleeplog.ts) */
export interface SleepGuess {
  /** เวลาวางมือถือและเวลาเริ่มใช้ แบบ HH:MM · null คือไม่รู้ */
  bed: string | null;
  wake: string | null;
  bedTs: number | null;
  wakeTs: number | null;
  /** เหตุผลที่ต้องถามเจ้าของ ว่างคือไม่ต้องถาม */
  ask: string[];
  /** ช่วงเงียบอื่นที่ยาวพอจะเป็นการนอน */
  alt: { bed: number; wake: number }[];
  /** ถ้าการนอนถูกตัดเป็นสองท่อน: ช่วงรวมตั้งแต่ท่อนแรกถึงท่อนหลัง */
  merged: { bed: number; wake: number } | null;
  at: number;
}

/** เวลาที่เจ้าของเลือกหรือแก้เอง หรือบอกว่าไม่ต้องนับคืนนี้ */
export interface SleepPick {
  bed: string | null;
  wake: string | null;
  bedTs: number | null;
  wakeTs: number | null;
  skip: boolean;
  at: number;
}

/** การนอนของคืนก่อนวันนี้ (เก็บไว้ที่วันตื่น)
 *  แยกค่าที่แอปเดากับค่าที่เจ้าของเลือกไว้คนละช่อง การเดาที่ส่งขึ้นคลาวด์ช้าจึงไม่มีทางทับสิ่งที่เจ้าของเลือก */
export interface SleepRec {
  auto?: SleepGuess | null;
  user?: SleepPick | null;
  /** จากเช็คอินเช้าเดิม: ตื่นเพราะแสบร้อน ไอ หรือสำลักกี่ครั้ง */
  refluxWakes?: number;
}

export interface DayLog {
  checks?: Record<string, number | null>;
  sleep?: SleepRec;
  steps?: number;
  protein?: number;
  nightOut?: boolean;
  note?: string;
  plan?: string[];
  top3?: string[];
}

export interface FocusSession {
  start: number;
  end: number;
  /** Active minutes, rounded (pauses excluded). */
  minutes: number;
  kind: 'work' | 'break';
  taskId?: string;
  area?: Area;
  label?: string;
  plannedSec?: number;
  /** Seconds the clock actually ran, pauses excluded. */
  activeSec?: number;
  /** Ran the full planned length. */
  completed?: boolean;
  /** timer = ครบเวลา · stop = กดจบก่อน · skip = ตัดพักเพื่อเริ่มรอบต่อไป · break = ตัดโฟกัสเพื่อไปพักทันที */
  endedBy?: 'timer' | 'stop' | 'skip' | 'break';
  /** พักยาวหลังครบชุด */
  long?: boolean;
  pauses?: { s: number; e: number }[];
  pausedSec?: number;
}

/** The round in progress. Kept in cfg/meta so it survives a reload and follows him across devices. */
export interface Pomo {
  phase: 'idle' | 'work' | 'break';
  running: boolean;
  /** When this round first started. */
  phaseStart: number | null;
  /** When the clock last started running. */
  resumedAt: number | null;
  /** Seconds counted before resumedAt. */
  accSec: number;
  plannedSec: number;
  /** A pause still open has e = null. */
  pauses: { s: number; e: number | null }[];
  taskId: string | null;
  label: string | null;
  area: Area | null;
  /** รอบที่ครบในชุดนี้ นับไปจนถึงพักยาว */
  set?: number;
  /** เวลาที่รอบล่าสุดจบ ใช้ตัดสินว่าเริ่มชุดใหม่ไหม */
  lastEnd?: number | null;
  /** ช่วงพักนี้เป็นพักยาว */
  long?: boolean;
}

export interface SetLog { reps?: number; seconds?: number; level: number }
export interface WorkoutSession {
  start: number;
  end: number;
  program: string;
  exercises: Record<string, SetLog[]>;
  rpe?: number;
}

export interface BreathSession { start: number; minutes: number; preset: string }

export interface MonthLog {
  month: string;
  days?: Record<string, DayLog>;
  focus?: Record<string, FocusSession>;
  workouts?: Record<string, WorkoutSession>;
  breath?: Record<string, BreathSession>;
}

export interface ShopItem {
  id: string;
  name: string;
  category: 'health' | 'skin' | 'hair' | 'dental' | 'laundry' | 'home' | 'fitness' | 'sleep';
  why: string;
  evidence?: 'high' | 'moderate' | 'low' | 'practical';
  status: 'need' | 'have' | 'ordered' | 'skip' | 'ask';
  qty?: string;
  priceTHB?: number;
  priceNote?: string;
  priceCheckedAt?: number;
  bestLink?: string;
  query: string;
  conditional?: string;
  order?: number;
}

export interface DigestItem {
  id: string;
  kind: 'email' | 'review' | 'sales' | 'news' | 'note';
  title: string;
  body?: string;
  source?: string;
  url?: string;
  at?: string;
  priority?: 'high' | 'normal' | 'low';
  rating?: number;
  amount?: number;
  /** Other Gmail message ids folded into this item, so the daily digest skips them next time. */
  refs?: string[];
}

export interface Digest {
  date: string;
  updatedAt?: string;
  summary?: string;
  items?: Record<string, DigestItem>;
}
