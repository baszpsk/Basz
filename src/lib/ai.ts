// Claude inside the app (artifact `sample` capability). Every call is made on
// an explicit tap, and the app keeps working if Claude is unavailable.

import { cap, errCode } from './claude';
import { store } from './store';
import { AREA_LABEL } from './priority';
import type { Area, Task } from './types';

type Sample = ((input: unknown, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: unknown, opts?: Record<string, unknown>) => Promise<T>;
};

export const sampleCap = () => cap<Sample>('sample');

export interface Question { id: string; q: string; options: string[] }
export interface ParsedTask {
  title: string;
  area: Area;
  impact: 1 | 2 | 3;
  due?: string | null;
  place?: string | null;
  estimateMin?: number;
  notes?: string;
  waitingOn?: string | null;
  followUpDays?: number | null;
  subtasks?: string[];
  questions?: Question[];
}

const AREAS = Object.keys(AREA_LABEL).join(' | ');

// Personal background lives in the private plan document, not in the code.
const context = () => store.s.plan?.aiContext || 'The user owns this personal planning app. Health comes first.';

export function copyForError(e: unknown): string {
  switch (errCode(e)) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return 'Claude ปิดอยู่ในแอปนี้ กรอกข้อมูลเองได้เลย';
    case 'rate_limited':
      return 'ตอนนี้ Claude ไม่ว่าง ลองใหม่อีกสักนาที';
    case 'session_expired':
      return 'เข้าสู่ระบบ Claude อีกครั้ง แล้วลองใหม่';
    case 'invalid_json':
    case 'empty_completion':
      return 'คำตอบจาก Claude ไม่ครบ กดลองใหม่';
    case 'cancelled':
      return '';
    default:
      return 'Claude ตอบไม่ได้ ตรวจดูเน็ตแล้วลองใหม่';
  }
}

/** The owner asked for the most capable model on every call, even when it is slower. */
const TIER = 'complex';

export async function parseTask(text: string, nowIso: string, weekdayName: string, answers?: Record<string, string>, signal?: AbortSignal, due?: string): Promise<ParsedTask> {
  const sample = await sampleCap();
  if (!sample) throw { code: 'capability_disabled' };
  const ans = answers && Object.keys(answers).length
    ? `\nThe user already answered these questions (use them, do not ask again):\n${Object.entries(answers).map(([q, a]) => `- ${q} → ${a}`).join('\n')}`
    : '';
  const prompt = `${context()}
Now: ${nowIso} (${weekdayName}), Asia/Bangkok.
Turn this quick note into ONE task. Note: """${text.slice(0, 2000)}"""${ans}${due ? `\nHe added it on the calendar day ${due}: use that date unless the note names another.` : ''}
Write every text he will read (title, notes, subtasks, questions, options) in plain, short Thai. Keep people's names and brand names as written.

Reply with only JSON:
{"title": string (short, in Thai, starts with a verb),
 "area": one of ${AREAS},
 "impact": 1|2|3 (3 = moves revenue, health or a key relationship a lot),
 "due": "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" or null (only if the note or answers say so; never invent),
 "place": where he has to go, only if the note says (short, as written), else null,
 "estimateMin": number (realistic minutes),
 "notes": string (optional, in Thai),
 "waitingOn": person name if the task is waiting on someone else, else null,
 "followUpDays": days until he should chase that person, else null,
 "subtasks": up to 5 short steps in Thai if the task is big, else [],
 "questions": up to 2 questions in Thai, ONLY when a missing detail would change priority or deadline; each {"id": short id, "q": question in Thai, "options": 2-4 short answers in Thai}. Otherwise [].}`;
  return sample.json<ParsedTask>(prompt, { modelTier: TIER, cache: false, signal });
}

export interface PlanAdvice { order: string[]; notes: Record<string, string>; questions: Question[]; summary: string }

export async function planDay(tasks: Task[], freeBlocks: string, nowIso: string, signal?: AbortSignal): Promise<PlanAdvice> {
  const sample = await sampleCap();
  if (!sample) throw { code: 'capability_disabled' };
  const list = tasks.slice(0, 40).map((t) => ({
    id: t.id, title: t.title, area: t.area, impact: t.impact, due: t.due || null, estimateMin: t.estimateMin || 25, waitingOn: t.waitingOn || null, notes: (t.notes || '').slice(0, 200),
  }));
  const prompt = `${context()}
Now: ${nowIso}. Free work blocks today: ${freeBlocks}.
Order his open tasks for today by real importance: health first, then what moves Seoulful's revenue and quality, then deadlines. Be blunt; do not flatter.
Tasks (JSON): ${JSON.stringify(list)}

Reply with only JSON:
{"order": [task ids, most important first, only tasks worth doing today],
 "notes": {task id: one short Thai sentence why},
 "summary": one or two Thai sentences: the plan for today,
 "questions": up to 2 Thai questions if a missing detail changes the order, each {"id","q","options":[2-4 short Thai answers]}, else []}`;
  return sample.json<PlanAdvice>(prompt, { modelTier: TIER, cache: false, signal });
}

export interface Breakdown { steps: { title: string; estimateMin: number; impact: 1 | 2 | 3 }[]; firstStep: string; questions: Question[] }

export async function breakDown(idea: string, signal?: AbortSignal): Promise<Breakdown> {
  const sample = await sampleCap();
  if (!sample) throw { code: 'capability_disabled' };
  const prompt = `${context()}
He wrote this idea or goal: """${idea.slice(0, 3000)}"""
Break it into 3-7 concrete next steps he can do himself or delegate (Thai titles, each starts with a verb). Prefer cheap tests before big spending.
Reply with only JSON: {"steps":[{"title","estimateMin","impact":1|2|3}], "firstStep": the one step to do first (Thai), "questions": up to 2 Thai questions if something important is unclear, each {"id","q","options":[2-4 short Thai answers]}, else []}`;
  return sample.json<Breakdown>(prompt, { modelTier: TIER, cache: false, signal });
}

export async function coach(question: string, facts: string, onText: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const sample = await sampleCap();
  if (!sample) throw { code: 'capability_disabled' };
  const prompt = `${context()}
Facts from his app (plan, today, stats):
${facts.slice(0, 12000)}

He asks: """${question.slice(0, 2000)}"""
Answer in plain, everyday Thai, short and practical. Use facts, say plainly when evidence is weak, never flatter, and tell him to ask his doctor for anything about his medicines.`;
  const r = await sample(prompt, { modelTier: TIER, cache: false, signal, onText: ({ text }: { text: string }) => onText(text) });
  return r.text;
}
