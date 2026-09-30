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
  focus: { work: number; short: number; long: number; every: number; autoBreak: boolean };
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
}

export interface DayLog {
  checks?: Record<string, number | null>;
  /** Last night: refluxWakes = times he woke from heartburn, cough or choking. A count, never a rating. */
  sleep?: { bed?: string; wake?: string; refluxWakes?: number };
  /** That day: extraAntacid = antacid or heartburn doses taken on top of the prescribed schedule. */
  symptoms?: { extraAntacid?: number };
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
  minutes: number;
  kind: 'work' | 'break';
  taskId?: string;
  area?: Area;
  label?: string;
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
