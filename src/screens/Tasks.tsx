import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { I } from '../components/icons';
import { burstFrom, Check, Empty, Glass, Pill, Seg, Sheet, toast, toneOf } from '../components/ui';
import { backFromWaiting, completeTask, delegate, deleteTask, followedUp, newTask, reopenTask, saveTask, snooze } from '../lib/actions';
import { breakDown, copyForError, parseTask, sampleCap, type Breakdown, type ParsedTask, type Question } from '../lib/ai';
import { useNow, useStore } from '../lib/hooks';
import type { Nav } from '../lib/nav';
import { AREA_LABEL, rankTasks } from '../lib/priority';
import { sound } from '../lib/sound';
import { dateKey, fmtShortDate, pad, relTime, todayKey, uid, wdName } from '../lib/time';
import type { Area, Task } from '../lib/types';

const AREAS = Object.keys(AREA_LABEL) as Area[];
const IMPACT_LABEL = { 1: 'ต่ำ', 2: 'ปานกลาง', 3: 'สูง' } as const;

export function AreaChips(props: { value: Area; onChange: (a: Area) => void }) {
  return (
    <div class="chips" role="radiogroup" aria-label="หมวด">
      {AREAS.map((a) => (
        <button key={a} role="radio" aria-checked={props.value === a} class={`chip ${props.value === a ? 'on' : ''}`} onClick={() => props.onChange(a)} style={{ '--tone': toneOf(a) } as JSX.CSSProperties}>
          <span class="sw" />
          {AREA_LABEL[a]}
        </button>
      ))}
    </div>
  );
}

export function TaskComposer(props: { onSubmit: (text: string, mode: 'task' | 'idea') => void; placeholder?: string; id: string }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'task' | 'idea'>('task');
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    props.onSubmit(t, mode);
    setText('');
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(140, el.scrollHeight) + 'px';
  }, [text]);
  return (
    <div class="stack-sm">
      <div class="composer glass">
        <textarea
          id={props.id}
          ref={ref}
          rows={1}
          value={text}
          placeholder={props.placeholder || (mode === 'task' ? 'พิมพ์งานหรือเรื่องที่ต้องทำ…' : 'พิมพ์ไอเดียพัฒนาร้าน…')}
          aria-label="งานใหม่"
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !(e as KeyboardEvent).isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button class="icon-btn" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }} aria-label="เพิ่ม" onClick={submit}>
          {I.plus({ size: 20 })}
        </button>
      </div>
      <div class="row" style={{ gap: '6px', paddingLeft: '6px' }}>
        <button class={`chip ${mode === 'task' ? 'on' : ''}`} onClick={() => setMode('task')}>งาน</button>
        <button class={`chip ${mode === 'idea' ? 'on' : ''}`} onClick={() => setMode('idea')}>ไอเดีย → ขั้นตอน</button>
      </div>
    </div>
  );
}

function Questions(props: { questions: Question[]; answers: Record<string, string>; onAnswer: (q: Question, a: string) => void }) {
  if (!props.questions.length) return null;
  return (
    <div class="stack">
      {props.questions.map((q) => (
        <div key={q.id} class="card pad stack-sm">
          <div class="row" style={{ gap: '8px' }}>
            {I.spark({ size: 16 })}
            <b style={{ fontSize: '14px' }}>{q.q}</b>
          </div>
          <div class="row wrap" style={{ gap: '6px' }}>
            {q.options.map((o) => (
              <button key={o} class={`chip ${props.answers[q.q] === o ? 'on' : ''}`} onClick={() => props.onAnswer(q, o)}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Draft {
  title: string;
  area: Area;
  impact: 1 | 2 | 3;
  dueDate: string;
  dueTime: string;
  place: string;
  estimateMin: number;
  notes: string;
  waitingOn: string;
  followUpDays: number;
  repeatDays: number;
  subtasks: string[];
}

const draftFromParsed = (p: ParsedTask, fallback: string): Draft => ({
  title: p.title || fallback,
  area: AREAS.includes(p.area) ? p.area : 'seoulful',
  impact: [1, 2, 3].includes(p.impact) ? p.impact : 2,
  dueDate: p.due ? p.due.slice(0, 10) : '',
  dueTime: p.due && p.due.includes('T') ? p.due.slice(11, 16) : '',
  place: p.place || '',
  estimateMin: p.estimateMin && p.estimateMin > 0 ? Math.round(p.estimateMin) : 25,
  notes: p.notes || '',
  waitingOn: p.waitingOn || '',
  followUpDays: p.followUpDays || 2,
  repeatDays: 0,
  subtasks: Array.isArray(p.subtasks) ? p.subtasks.slice(0, 8) : [],
});

function draftToTask(d: Draft, base?: Task): Task {
  const due = d.dueDate ? (d.dueTime ? `${d.dueDate}T${d.dueTime}` : d.dueDate) : undefined;
  const t: Task = {
    ...(base || newTask({ source: 'ai' })),
    title: d.title.trim() || 'งานไม่มีชื่อ',
    area: d.area,
    impact: d.impact,
    due,
    place: d.place.trim() || undefined,
    estimateMin: d.estimateMin,
    notes: d.notes.trim() || undefined,
    repeatDays: d.repeatDays || undefined,
  };
  if (!base) t.subtasks = d.subtasks.filter(Boolean).map((title) => ({ id: uid(), title, done: false }));
  if (d.waitingOn.trim() && !base) {
    t.status = 'waiting';
    t.waitingOn = d.waitingOn.trim();
    t.followUpAt = Date.now() + d.followUpDays * 86400000;
    t.followUps = 0;
  }
  return t;
}

function DraftForm(props: { d: Draft; set: (d: Draft) => void; showWaiting: boolean }) {
  const { d, set } = props;
  return (
    <div class="stack">
      <div class="field">
        <label for="t-title">ชื่องาน</label>
        <input id="t-title" class="input" value={d.title} onInput={(e) => set({ ...d, title: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="field">
        <label>หมวด</label>
        <AreaChips value={d.area} onChange={(area) => set({ ...d, area })} />
      </div>
      <div class="field">
        <label>ความสำคัญ</label>
        <Seg id="t-impact" options={[{ id: '1', label: 'ต่ำ' }, { id: '2', label: 'ปานกลาง' }, { id: '3', label: 'สูง' }]} value={String(d.impact) as '1' | '2' | '3'} onChange={(v) => set({ ...d, impact: Number(v) as 1 | 2 | 3 })} />
      </div>
      <div class="row" style={{ gap: '10px' }}>
        <div class="field grow">
          <label for="t-date">กำหนดส่ง</label>
          <input id="t-date" type="date" class="input" value={d.dueDate} onInput={(e) => set({ ...d, dueDate: (e.target as HTMLInputElement).value })} />
        </div>
        <div class="field" style={{ width: '120px' }}>
          <label for="t-time">เวลา</label>
          <input id="t-time" type="time" class="input" value={d.dueTime} onInput={(e) => set({ ...d, dueTime: (e.target as HTMLInputElement).value })} />
        </div>
      </div>
      <div class="field">
        <label for="t-place">สถานที่ (ถ้าต้องไป)</label>
        <input id="t-place" class="input" placeholder="เช่น คลินิก สาขา หรือชื่อร้าน" value={d.place} onInput={(e) => set({ ...d, place: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="field">
        <label>ใช้เวลา</label>
        <div class="chips">
          {[10, 25, 50, 90, 120].map((m) => (
            <button key={m} class={`chip ${d.estimateMin === m ? 'on' : ''}`} onClick={() => set({ ...d, estimateMin: m })}>
              {m < 60 ? `${m} นาที` : `${m / 60} ชม.`}
            </button>
          ))}
        </div>
      </div>
      {props.showWaiting && (
        <div class="row" style={{ gap: '10px' }}>
          <div class="field grow">
            <label for="t-wait">รอใคร (ถ้ามี)</label>
            <input id="t-wait" class="input" placeholder="เช่น ชื่อพนักงาน/ซัพพลายเออร์" value={d.waitingOn} onInput={(e) => set({ ...d, waitingOn: (e.target as HTMLInputElement).value })} />
          </div>
          {d.waitingOn && (
            <div class="field" style={{ width: '110px' }}>
              <label for="t-fu">ตามงานอีก</label>
              <select id="t-fu" class="select" value={String(d.followUpDays)} onChange={(e) => set({ ...d, followUpDays: Number((e.target as HTMLSelectElement).value) })}>
                {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} วัน</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <div class="field">
        <label for="t-repeat">ทำซ้ำ</label>
        <select id="t-repeat" class="select" value={String(d.repeatDays)} onChange={(e) => set({ ...d, repeatDays: Number((e.target as HTMLSelectElement).value) })}>
          <option value="0">ไม่ทำซ้ำ</option>
          <option value="1">ทุกวัน</option>
          <option value="7">ทุกสัปดาห์</option>
          <option value="14">ทุก 2 สัปดาห์</option>
          <option value="30">ทุกเดือน</option>
        </select>
      </div>
      {!!d.subtasks.length && (
        <div class="field">
          <label>ขั้นย่อย</label>
          <div class="card list">
            {d.subtasks.map((st, i) => (
              <div key={i} class="item">
                <span class="tiny num">{i + 1}</span>
                <input class="input" style={{ padding: '8px 10px' }} value={st} aria-label={`ขั้นที่ ${i + 1}`} onInput={(e) => set({ ...d, subtasks: d.subtasks.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)) })} />
                <button class="icon-btn" aria-label="ลบขั้นย่อย" onClick={() => set({ ...d, subtasks: d.subtasks.filter((_, j) => j !== i) })}>{I.close({ size: 16 })}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div class="field">
        <label for="t-notes">บันทึก</label>
        <textarea id="t-notes" class="textarea" value={d.notes} onInput={(e) => set({ ...d, notes: (e.target as HTMLTextAreaElement).value })} />
      </div>
    </div>
  );
}

/** New task / idea from free text, sorted by Claude when available. */
export function AddSheet(props: { open: boolean; text: string; mode: 'task' | 'idea'; due?: string; onClose: () => void }) {
  const now = useNow(60000);
  const [phase, setPhase] = useState<'thinking' | 'ready'>('ready');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [steps, setSteps] = useState<(Breakdown['steps'][number] & { on: boolean })[]>([]);
  const [first, setFirst] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const s = useStore();

  const iso = () => {
    const d = now;
    return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const run = async (ans: Record<string, string>) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setNote('');
    const sample = await sampleCap();
    if (!sample) {
      setDraft(draftFromParsed({ title: props.text, area: 'seoulful', impact: 2, due: props.due }, props.text));
      setNote('ใช้ Claude ในหน้านี้ไม่ได้ กรอกรายละเอียดเองได้เลย');
      setPhase('ready');
      return;
    }
    setPhase('thinking');
    try {
      if (props.mode === 'idea') {
        const b = await breakDown(props.text + (Object.keys(ans).length ? '\nAnswers: ' + JSON.stringify(ans) : ''), c.signal);
        setSteps((b.steps || []).slice(0, 8).map((x) => ({ ...x, on: true })));
        setFirst(b.firstStep || '');
        setQuestions(b.questions || []);
      } else {
        const p = await parseTask(props.text, iso(), wdName(now.getDay()), ans, c.signal, props.due);
        setDraft(draftFromParsed({ ...p, due: p.due || props.due }, props.text));
        setQuestions((p.questions || []).filter((q) => q && q.q && Array.isArray(q.options) && !ans[q.q]));
      }
    } catch (e) {
      const msg = copyForError(e);
      if (msg) setNote(msg);
      if (props.mode === 'task') setDraft((d) => d || draftFromParsed({ title: props.text, area: 'seoulful', impact: 2, due: props.due }, props.text));
    } finally {
      if (ctl.current === c) setPhase('ready');
    }
  };

  useEffect(() => {
    if (!props.open) return;
    setDraft(null);
    setQuestions([]);
    setAnswers({});
    setSteps([]);
    setFirst('');
    run({});
    return () => ctl.current?.abort();
  }, [props.open, props.text, props.mode]);

  const answer = (q: Question, a: string) => {
    const next = { ...answers, [q.q]: a };
    setAnswers(next);
    run(next);
  };

  const save = () => {
    if (props.mode === 'idea') {
      const chosen = steps.filter((x) => x.on);
      chosen.forEach((x, i) => saveTask(newTask({ title: x.title, area: 'seoulful', impact: x.impact || 2, estimateMin: x.estimateMin || 25, createdAt: Date.now() + i, notes: `จากไอเดีย: ${props.text.slice(0, 200)}`, source: 'ai' })));
      toast(`เพิ่ม ${chosen.length} งานแล้ว`);
    } else if (draft) {
      const t = draftToTask(draft);
      saveTask(t);
      const ranked = rankTasks(Object.values({ ...s.tasks, [t.id]: t }), Date.now(), todayKey(new Date(), s.settings.rolloverHour), s.settings.rolloverHour);
      const pos = ranked.findIndex((r) => r.task.id === t.id);
      toast(t.status === 'waiting' ? `รอ ${t.waitingOn} · ตั้งเตือนแล้ว` : pos >= 0 ? `เพิ่มแล้ว · อยู่ลำดับที่ ${pos + 1}` : 'เพิ่มแล้ว');
    }
    sound.done();
    props.onClose();
  };

  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.mode === 'idea' ? 'ไอเดีย → ขั้นตอน' : 'งานใหม่'}>
      <div class="stack">
        <div class="card pad sub" style={{ whiteSpace: 'pre-wrap' }}>{props.text}</div>
        {phase === 'thinking' && (
          <div class="row">
            <div class="skeleton" style={{ width: '22px', height: '22px', borderRadius: '50%' }} />
            <span class="sub grow">Claude กำลังคิดให้…</span>
            <button class="btn small ghost" onClick={() => ctl.current?.abort()}>หยุด</button>
          </div>
        )}
        {note && <div class="banner">{note}</div>}
        <Questions questions={questions} answers={answers} onAnswer={answer} />
        {props.mode === 'idea' ? (
          steps.length > 0 && (
            <div class="stack">
              {first && <div class="card pad"><div class="eyebrow">ทำอันนี้ก่อน</div><div class="h3">{first}</div></div>}
              <div class="card list">
                {steps.map((x, i) => (
                  <div key={i} class="item">
                    <Check on={x.on} label={x.title} onToggle={() => setSteps(steps.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} tone="var(--accent)" />
                    <div class="grow">
                      <div class="t">{x.title}</div>
                      <div class="d">{x.estimateMin} นาที · ความสำคัญ{IMPACT_LABEL[x.impact] || 'ปานกลาง'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          draft && <DraftForm d={draft} set={setDraft} showWaiting />
        )}
        <button class="btn primary block" disabled={phase === 'thinking' || (props.mode === 'task' ? !draft : !steps.some((x) => x.on))} onClick={save}>
          {props.mode === 'idea' ? 'เพิ่มขั้นตอนเป็นงาน' : 'เพิ่มงาน'}
        </button>
      </div>
    </Sheet>
  );
}

/** Edit an existing task. */
export function TaskSheet(props: { task: Task | null; onClose: () => void; nav: Nav }) {
  const t = props.task;
  const [d, setD] = useState<Draft | null>(null);
  const [person, setPerson] = useState('');
  const [days, setDays] = useState(2);
  const [confirmDel, setConfirmDel] = useState(false);
  const [newStep, setNewStep] = useState('');
  const s = useStore();
  const live = t ? s.tasks[t.id] || t : null;
  useEffect(() => {
    if (!t) return;
    setD({
      title: t.title, area: t.area, impact: t.impact, dueDate: t.due?.slice(0, 10) || '', dueTime: t.due?.includes('T') ? t.due.slice(11, 16) : '',
      place: t.place || '',
      estimateMin: t.estimateMin || 25, notes: t.notes || '', waitingOn: '', followUpDays: 2, repeatDays: t.repeatDays || 0, subtasks: [],
    });
    setPerson(t.waitingOn || '');
    setConfirmDel(false);
  }, [t?.id]);
  if (!t || !live || !d) return <Sheet open={false} onClose={props.onClose} />;
  const commit = () => {
    saveTask(draftToTask(d, live));
    toast('บันทึกแล้ว');
    props.onClose();
  };
  const toggleStep = (id: string) => saveTask({ ...live, subtasks: (live.subtasks || []).map((x) => (x.id === id ? { ...x, done: !x.done } : x)) });
  const addStep = () => {
    if (!newStep.trim()) return;
    saveTask({ ...live, subtasks: [...(live.subtasks || []), { id: uid(), title: newStep.trim(), done: false }] });
    setNewStep('');
  };
  return (
    <Sheet open={!!t} onClose={props.onClose} title={live.status === 'done' ? 'เสร็จแล้ว' : live.status === 'waiting' ? 'รอคนอื่น' : 'งาน'}>
      <div class="stack">
        <div class="row wrap" style={{ gap: '8px' }}>
          {live.status !== 'done' && (
            <button class="btn primary" onClick={(e) => { completeTask(live); sound.done(); burstFrom(e, ''); props.onClose(); }}>
              {I.check({ size: 18 })} เสร็จ
            </button>
          )}
          {live.status === 'todo' && (
            <button class="btn" onClick={() => { props.onClose(); props.nav.focus(live, true); }}>{I.focus({ size: 18 })} โฟกัส 25 นาที</button>
          )}
          {live.status === 'done' && <button class="btn" onClick={() => { reopenTask(live); props.onClose(); }}>ยังไม่เสร็จ</button>}
          {live.flow && live.status === 'todo' && (
            <button class="btn" onClick={() => { snooze(live, 30); toast('เลื่อนไป 30 นาทีแล้ว'); props.onClose(); }}>เลื่อน 30 นาที</button>
          )}
          <button class="btn" aria-pressed={!!live.pinned} onClick={() => saveTask({ ...live, pinned: !live.pinned })}>{live.pinned ? 'เลิกปักหมุด' : 'ปักหมุดไว้บนสุด'}</button>
        </div>

        {live.status === 'waiting' ? (
          <div class="card pad stack-sm">
            <div class="h3">รอ {live.waitingOn}</div>
            <div class="sub">
              {live.followUpAt ? `ตามงานครั้งถัดไป ${relTime(live.followUpAt, Date.now())}` : ''} · ตามไปแล้ว {live.followUps || 0} ครั้ง
            </div>
            <div class="row wrap" style={{ gap: '8px' }}>
              <button class="btn small" onClick={() => { followedUp(live, 2); toast('จะเตือนอีกครั้งใน 2 วัน'); }}>ตามแล้ว · เตือนอีก 2 วัน</button>
              <button class="btn small" onClick={() => { backFromWaiting(live); toast('กลับเข้ารายการแล้ว'); }}>เขาส่งงานแล้ว</button>
            </div>
          </div>
        ) : (
          live.status === 'todo' && !live.flow && (
            <div class="card pad stack-sm">
              <div class="h3">ให้คนอื่นทำ</div>
              <div class="row" style={{ gap: '8px' }}>
                <input class="input grow" id="t-delegate" placeholder="ให้ใครทำ" value={person} onInput={(e) => setPerson((e.target as HTMLInputElement).value)} />
                <select class="select" style={{ width: '92px' }} aria-label="ตามงานอีก" value={String(days)} onChange={(e) => setDays(Number((e.target as HTMLSelectElement).value))}>
                  {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} วัน</option>)}
                </select>
              </div>
              <button class="btn small" disabled={!person.trim()} onClick={() => { delegate(live, person.trim(), days); toast(`รอ ${person.trim()} · จะเตือนให้ตามงาน`); props.onClose(); }}>มอบงานและตามงาน</button>
            </div>
          )
        )}

        {!!live.subtasks?.length && (
          <div class="card list">
            {live.subtasks.map((x) => (
              <div key={x.id} class={`item ${x.done ? 'done' : ''}`}>
                <Check on={x.done} label={x.title} onToggle={(e) => { toggleStep(x.id); if (!x.done) burstFrom(e, ''); }} />
                <div class="t grow">{x.title}</div>
              </div>
            ))}
          </div>
        )}
        <div class="row" style={{ gap: '8px' }}>
          <input class="input grow" id="t-newstep" placeholder="เพิ่มขั้นย่อย" value={newStep} onInput={(e) => setNewStep((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} />
          <button class="icon-btn" aria-label="เพิ่มขั้นย่อย" onClick={addStep}>{I.plus({ size: 18 })}</button>
        </div>

        <DraftForm d={d} set={setD} showWaiting={false} />
        <button class="btn primary block" onClick={commit}>บันทึก</button>
        {confirmDel ? (
          <div class="row">
            <span class="sub grow">ลบงานนี้ถาวรใช่ไหม?</span>
            <button class="btn small ghost" onClick={() => setConfirmDel(false)}>เก็บไว้</button>
            <button class="btn small" style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => { deleteTask(live.id); toast('ลบแล้ว'); props.onClose(); }}>ลบ</button>
          </div>
        ) : (
          <button class="btn ghost block" onClick={() => setConfirmDel(true)}>{I.trash({ size: 18 })} ลบ</button>
        )}
      </div>
    </Sheet>
  );
}

export function TaskRow(props: { task: Task; reasons?: string[]; onOpen: () => void; showDue?: boolean }) {
  const t = props.task;
  const done = t.status === 'done';
  return (
    <div class={`item ${done ? 'done' : ''}`} role="button" tabIndex={0} onClick={props.onOpen} onKeyDown={(e) => e.key === 'Enter' && props.onOpen()}>
      <Check
        on={done}
        tone={toneOf(t.area)}
        label={`ทำเสร็จ: ${t.title}`}
        onToggle={(e) => {
          if (done) reopenTask(t);
          else {
            completeTask(t);
            sound.done();
            burstFrom(e, '', toneOf(t.area));
          }
        }}
      />
      <div class="grow">
        <div class="t">{t.title}</div>
        <div class="row wrap" style={{ gap: '6px', marginTop: '3px' }}>
          <span class="d row" style={{ gap: '5px' }}>
            <span class="area-dot" style={{ '--tone': toneOf(t.area) } as JSX.CSSProperties} />
            {AREA_LABEL[t.area]}
          </span>
          {props.reasons?.slice(0, 2).map((r) => <Pill key={r} tone={r.startsWith('เลยกำหนด') ? 'var(--bad)' : r === 'กำหนดส่งวันนี้' ? 'var(--warn)' : undefined}>{r}</Pill>)}
          {props.showDue && t.due && <span class="d">· กำหนดส่ง {fmtShortDate(t.due.slice(0, 10))}{t.due.includes('T') ? ' ' + t.due.slice(11, 16) : ''}</span>}
          {t.status === 'waiting' && t.followUpAt && <span class="d">· ตามงาน {relTime(t.followUpAt, Date.now())}</span>}
          {!!t.subtasks?.length && <span class="d">· {t.subtasks.filter((x) => x.done).length}/{t.subtasks.length}</span>}
        </div>
      </div>
      <span style={{ color: 'var(--ink-3)' }}>{I.arrow({ size: 18 })}</span>
    </div>
  );
}

export function TasksScreen(props: { nav: Nav }) {
  const s = useStore();
  const now = useNow(30000);
  const [view, setView] = useState<'today' | 'all' | 'waiting' | 'done'>('today');
  const [area, setArea] = useState<Area | 'all'>('all');
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const all = Object.values(s.tasks);
  const ranked = useMemo(() => rankTasks(all, now.getTime(), today, R), [s.tasks, now, today]);
  const open = all.filter((t) => t.status === 'todo');
  const waiting = all.filter((t) => t.status === 'waiting').sort((a, b) => (a.followUpAt || 0) - (b.followUpAt || 0));
  const done = all.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 60);
  const upcoming = open.filter((t) => t.notBefore && t.notBefore > now.getTime());
  const byArea = (list: Task[]) => (area === 'all' ? list : list.filter((t) => t.area === area));

  return (
    <div class="screen">
      <div class="topbar">
        <div class="grow">
          <div class="eyebrow">งานค้าง {open.length} · รอคนอื่น {waiting.length}</div>
          <h1 class="h1">งาน</h1>
        </div>
      </div>
      <TaskComposer id="tasks-composer" onSubmit={(text, mode) => props.nav.add(text, mode)} />
      <Seg id="tasks-view" options={[{ id: 'today', label: 'วันนี้' }, { id: 'all', label: 'ทั้งหมด' }, { id: 'waiting', label: 'รอคนอื่น' }, { id: 'done', label: 'เสร็จแล้ว' }]} value={view} onChange={setView} />
      {view === 'all' && (
        <div class="chips">
          <button class={`chip ${area === 'all' ? 'on' : ''}`} onClick={() => setArea('all')}>ทั้งหมด</button>
          {AREAS.map((a) => (
            <button key={a} class={`chip ${area === a ? 'on' : ''}`} style={{ '--tone': toneOf(a) } as JSX.CSSProperties} onClick={() => setArea(a)}>
              <span class="sw" />{AREA_LABEL[a]}
            </button>
          ))}
        </div>
      )}
      <Glass class="list">
        {view === 'today' &&
          (ranked.length ? ranked.map((r) => <TaskRow key={r.task.id} task={r.task} reasons={r.reasons} onOpen={() => props.nav.task(r.task)} />) : <Empty title="ยังไม่มีงาน" body="พิมพ์งานในช่องด้านบน ระบบจะจัดลำดับและถามรายละเอียดที่ขาดให้" />)}
        {view === 'all' &&
          (byArea(open).length ? byArea(open).sort((a, b) => b.impact - a.impact || a.createdAt - b.createdAt).map((t) => <TaskRow key={t.id} task={t} showDue onOpen={() => props.nav.task(t)} />) : <Empty title="ไม่มีงานค้าง" />)}
        {view === 'waiting' &&
          (waiting.length ? waiting.map((t) => <TaskRow key={t.id} task={t} onOpen={() => props.nav.task(t)} />) : <Empty title="ไม่มีงานที่รอคนอื่น" body="งานที่มอบให้คนอื่นจะอยู่ที่นี่ และระบบจะเตือนให้ตามจนเสร็จ" />)}
        {view === 'done' &&
          (done.length ? done.map((t) => <TaskRow key={t.id} task={t} onOpen={() => props.nav.task(t)} />) : <Empty title="ยังไม่มีงานที่เสร็จ" />)}
      </Glass>
      {view === 'today' && upcoming.length > 0 && (
        <>
          <div class="section-head"><h2 class="h2">ตั้งเวลาไว้</h2><span class="tiny">เริ่มทีหลัง</span></div>
          <Glass class="list">
            {upcoming.sort((a, b) => (a.notBefore || 0) - (b.notBefore || 0)).map((t) => (
              <div key={t.id} class="item" role="button" tabIndex={0} onClick={() => props.nav.task(t)}>
                <span class="tiny num" style={{ width: '64px' }}>{relTime(t.notBefore || 0, now.getTime())}</span>
                <div class="grow t">{t.title}</div>
              </div>
            ))}
          </Glass>
        </>
      )}
    </div>
  );
}
