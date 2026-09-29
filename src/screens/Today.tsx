import { Fragment, type JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { I } from '../components/icons';
import { burstFrom, Check, CountUp, Delta, Glass, Pill, Progress, Ring, Sheet, toast, toneOf } from '../components/ui';
import { completeTask, patchDay, saveTask, setCheck, snooze } from '../lib/actions';
import { copyForError, planDay, sampleCap } from '../lib/ai';
import type { Alert } from '../lib/alerts';
import { useNow, useStore } from '../lib/hooks';
import type { Nav } from '../lib/nav';
import { AREA_LABEL, rankTasks, slotTasks } from '../lib/priority';
import { buildDay, currentBlock, type Block } from '../lib/schedule';
import { caffeineCutoff } from '../lib/sleepcoach';
import { sound } from '../lib/sound';
import { addDays, dateKey, fmtDayLong, fmtDuration, fmtHM, logicalMinutes, monthOf, pad, parseHM, todayKey } from '../lib/time';
import type { DayLog, Task } from '../lib/types';
import { saveBackup } from '../lib/backup';
import { buildMetrics, summarize } from '../lib/progress';
import { TaskComposer, TaskRow } from './Tasks';

const KIND_TONE: Record<string, string> = {
  wake: 'var(--a-health)', trade: 'var(--a-trading)', meal: 'var(--a-health)', work: 'var(--a-seoulful)', move: 'var(--a-health)',
  break: 'var(--ink-3)', evening: 'var(--a-seoulful)', wind: 'var(--a-growth)', sleep: 'var(--a-growth)', home: 'var(--a-home)', review: 'var(--accent)',
};
const blockTone = (b?: Block) => (b ? (b.kind === 'work' || b.kind === 'evening' ? toneOf(b.area) : KIND_TONE[b.kind]) : 'var(--accent)');

export function useDay() {
  const s = useStore();
  const now = useNow(15000);
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const dayLog: DayLog = s.logs[monthOf(today)]?.days?.[today] || {};
  const prev = addDays(today, -1);
  const prevLog = s.logs[monthOf(prev)]?.days?.[prev];
  const blocks = useMemo(() => buildDay(today, s.settings, s.plan, dayLog, prevLog), [today, s.settings, s.plan, dayLog.nightOut, prevLog?.nightOut]);
  const nowMin = logicalMinutes(now, R);
  const ranked = useMemo(() => rankTasks(Object.values(s.tasks), now.getTime(), today, R), [s.tasks, now, today]);
  const slots = useMemo(() => slotTasks(blocks, ranked, nowMin, dayLog.plan), [blocks, ranked, Math.floor(nowMin / 5), dayLog.plan]);
  const checks = dayLog.checks || {};
  return { s, now, today, dayLog, prevLog, blocks, nowMin, ranked, slots, checks, R };
}

function greeting(h: number) {
  if (h >= 5 && h < 12) return 'อรุณสวัสดิ์';
  if (h >= 12 && h < 17) return 'สวัสดีตอนบ่าย';
  if (h >= 17 && h < 22) return 'สวัสดีตอนเย็น';
  return 'ดึกแล้ว';
}

function ItemList(props: { block: Block; checks: Record<string, number | null>; today: string; compact?: boolean }) {
  const items = props.block.items || [];
  if (!items.length) return null;
  return (
    <div class="list card" style={{ background: 'transparent', boxShadow: 'none' }}>
      {items.map((it) => {
        const on = !!props.checks[it.id];
        return (
          <div key={it.id} class={`item ${on ? 'done' : ''}`} style={{ padding: props.compact ? '8px 4px' : undefined, minHeight: props.compact ? '44px' : undefined }}>
            <Check
              on={on}
              tone={it.kind === 'med' ? 'var(--a-growth)' : blockTone(props.block)}
              label={it.label}
              onToggle={(e) => {
                setCheck(props.today, it.id, !on);
                if (!on) {
                  sound.tick();
                  burstFrom(e, '', it.kind === 'med' ? 'var(--a-growth)' : undefined);
                }
              }}
            />
            <div class="grow">
              <div class="t row" style={{ gap: '6px' }}>
                {it.kind === 'med' && <span style={{ color: 'var(--a-growth)' }}>{I.pill({ size: 16 })}</span>}
                {it.label}
              </div>
              {it.hint && <div class="d">{it.hint}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionButton(props: { block: Block; nav: Nav; firstTask?: Task }) {
  const b = props.block;
  const n = props.nav;
  switch (b.action) {
    case 'focus':
      return props.firstTask ? <button class="btn primary" onClick={() => n.task(props.firstTask!)}>{I.arrow({ size: 18 })} เปิดงาน</button> : null;
    case 'workout':
      return <button class="btn primary" onClick={() => n.workout(b.program || 'A')}>{I.play({ size: 18 })} เริ่ม{b.title}</button>;
    case 'breath':
      return <button class="btn primary" onClick={() => n.breath(b.id === 'read' ? 'sleep' : 'meal')}>{I.wave({ size: 18 })} เริ่มหายใจท้อง</button>;
    case 'walk':
      return <button class="btn primary" onClick={() => n.breath('daily')}>{I.clock({ size: 18 })} จับเวลาเดิน</button>;
    case 'laundry':
      return <button class="btn primary" onClick={() => n.hub('laundry')}>{I.shirt({ size: 18 })} เริ่มซักผ้า</button>;
    case 'plan':
      return <button class="btn primary" onClick={() => n.plan()}>{I.spark({ size: 18 })} วางแผน</button>;
    case 'checkin':
      return <button class="btn" onClick={() => n.checkin()}>{I.stethoscope({ size: 18 })} เช็คอิน</button>;
    default:
      return null;
  }
}

function NowCard(props: { d: ReturnType<typeof useDay>; nav: Nav }) {
  const { blocks, nowMin, checks, today, slots, s } = props.d;
  const { now: cur, next } = currentBlock(blocks, nowMin);
  const W = parseHM(s.settings.wake, s.settings.rolloverHour);
  const tone = blockTone(cur || next);
  if (!cur) {
    const mins = next ? next.start - nowMin : 0;
    return (
      <Glass class="hero" tone={tone}>
        <div class="glow" />
        <div class="eyebrow">ถัดไป · {next ? fmtHM(next.start) : ''}</div>
        <div class="h1" style={{ margin: '6px 0 4px' }}>{next ? next.title : 'เวลาว่าง'}</div>
        <div class="sub">{next ? `อีก ${fmtDuration(mins)} · ${next.sub || ''}` : 'ตอนนี้ไม่มีอะไรในตาราง'}</div>
      </Glass>
    );
  }
  const total = cur.end - cur.start;
  const done = nowMin - cur.start;
  const left = cur.end - nowMin;
  const items = cur.items || [];
  const firstTask = slots[cur.id]?.[0]?.task;
  if (cur.kind === 'sleep') {
    const toWake = W + 1440 - nowMin;
    return (
      <Glass class="hero" tone="var(--a-growth)">
        <div class="glow" />
        <div class="row between"><span class="eyebrow">ตอนนี้ · การนอน</span>{I.moon({ size: 20 })}</div>
        <div class="h1" style={{ margin: '8px 0 4px' }}>ได้เวลานอนแล้ว</div>
        <div class="sub">ตื่น {s.settings.wake} · เหลือ {fmtDuration(toWake)} · ถ้า 20 นาทียังไม่หลับ ลุกไปนั่งที่แสงสลัวก่อน</div>
      </Glass>
    );
  }
  return (
    <Glass class="hero" tone={tone}>
      <div class="glow" />
      <div class="row between">
        <Pill tone={tone}>ตอนนี้ · {fmtHM(cur.start)}–{fmtHM(cur.end)}</Pill>
        <span class="tiny num">เหลือ {fmtDuration(left)}</span>
      </div>
      <h2 class="h1" style={{ margin: '10px 0 2px' }}>{cur.title}</h2>
      {cur.sub && <div class="sub">{cur.sub}</div>}
      <div style={{ margin: '12px 0' }}><Progress value={done / total} tone={tone} label="ความคืบหน้าช่วงนี้" /></div>
      {items.length > 0 && <ItemList block={cur} checks={checks} today={today} compact />}
      {firstTask && (
        <div class="card pad" style={{ margin: '8px 0 4px' }}>
          <div class="eyebrow">สำคัญที่สุดตอนนี้</div>
          <div class="h3" style={{ marginTop: '2px' }}>{firstTask.title}</div>
          <div class="tiny">{AREA_LABEL[firstTask.area]} · {firstTask.estimateMin || 25} นาที</div>
        </div>
      )}
      <div class="row wrap" style={{ gap: '8px', marginTop: '10px' }}>
        <ActionButton block={cur} nav={props.nav} firstTask={firstTask} />
        {next && <span class="tiny">ถัดไป · {fmtHM(next.start)} {next.title}</span>}
      </div>
    </Glass>
  );
}

function AlertsStrip(props: { alerts: Alert[]; nav: Nav }) {
  const list = props.alerts.filter((a) => a.kind !== 'digest').slice(0, 3);
  if (!list.length) return null;
  return (
    <Glass class="list">
      {list.map((a) => (
        <div key={a.id} class="item">
          <span style={{ color: a.urgent ? 'var(--warn)' : 'var(--ink-2)' }}>{a.kind === 'med' ? I.pill() : a.kind === 'flow' ? I.shirt() : a.kind === 'followup' ? I.user() : a.kind === 'sleep' ? I.moon() : a.kind === 'backup' ? I.download() : I.clock()}</span>
          <div class="grow">
            <div class="t">{a.title}</div>
            {a.body && <div class="d">{a.body}</div>}
          </div>
          {a.task && a.kind === 'flow' && (
            <div class="row" style={{ gap: '6px' }}>
              <button class="btn small ghost" onClick={() => { snooze(a.task!, 30); toast('เลื่อนไป 30 นาทีแล้ว'); }}>ไว้ทีหลัง</button>
              <button class="btn small" onClick={(e) => { completeTask(a.task!); sound.done(); burstFrom(e, ''); }}>เสร็จ</button>
            </div>
          )}
          {a.task && a.kind !== 'flow' && <button class="btn small" onClick={() => props.nav.task(a.task!)}>เปิด</button>}
          {a.kind === 'sleep' && <button class="btn small" onClick={() => props.nav.hub('alarm')}>ดู</button>}
          {a.kind === 'backup' && <button class="btn small" onClick={async () => { const r = await saveBackup(); toast(r === 'saved' ? 'บันทึกไฟล์สำรองแล้ว' : r === 'unavailable' ? 'ที่นี่ดาวน์โหลดไฟล์สำรองไม่ได้' : 'ยังไม่ได้บันทึกไฟล์สำรอง'); }}>บันทึก</button>}
        </div>
      ))}
    </Glass>
  );
}

function Timeline(props: { d: ReturnType<typeof useDay>; onOpen: (b: Block) => void }) {
  const { blocks, nowMin, checks, slots, s } = props.d;
  const cutoffHM = caffeineCutoff(s.settings);
  const cutoff = parseHM(cutoffHM, s.settings.rolloverHour);
  const [full, setFull] = useState(false);
  const visible = full ? blocks : blocks.filter((b) => b.end > nowMin - 30).slice(0, 7);
  let markerShown = false;
  return (
    <Glass class="pad">
      <div class="section-head" style={{ padding: '0 0 8px' }}>
        <h2 class="h2">วันนี้</h2>
        <button class="chip" onClick={() => setFull(!full)}>{full ? 'ย่อ' : 'ทั้งวัน'}</button>
      </div>
      <div class="timeline">
        {visible.map((b) => {
          const isNow = nowMin >= b.start && nowMin < b.end;
          const past = b.end <= nowMin;
          const items = b.items || [];
          const doneCount = items.filter((i) => checks[i.id]).length;
          const showMarker = !markerShown && b.start >= cutoff;
          if (showMarker) markerShown = true;
          return (
            <Fragment key={b.id}>
              {showMarker && <div class="marker">☕ {cutoffHM} หยุดคาเฟอีน</div>}
              <button class={`tl ${isNow ? 'now' : ''} ${past ? 'past' : ''}`} style={{ '--tone': blockTone(b) } as JSX.CSSProperties} onClick={() => props.onOpen(b)}>
                <div class="row" style={{ alignItems: 'flex-start' }}>
                  <span class="time">{fmtHM(b.start)}</span>
                  <div class="grow">
                    <div class="row between">
                      <span class="h3">{b.title}</span>
                      {items.length > 0 && <span class="tiny num">{doneCount}/{items.length}</span>}
                    </div>
                    {b.sub && <div class="tiny">{b.sub}</div>}
                    {slots[b.id] && (
                      <div class="slots">
                        {slots[b.id].slice(0, 4).map((sl) => (
                          <div key={sl.task.id} class="slot">
                            <span class="area-dot" style={{ '--tone': toneOf(sl.task.area) } as JSX.CSSProperties} />
                            <span class="num">{fmtHM(sl.start)}</span>
                            <span class="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sl.task.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </Fragment>
          );
        })}
      </div>
    </Glass>
  );
}

export function BlockSheet(props: { block: Block | null; d: ReturnType<typeof useDay>; nav: Nav; onClose: () => void }) {
  const b = props.block;
  if (!b) return <Sheet open={false} onClose={props.onClose} />;
  const sl = props.d.slots[b.id] || [];
  return (
    <Sheet open={!!b} onClose={props.onClose} title={b.title}>
      <div class="stack">
        <div class="row between">
          <Pill tone={blockTone(b)}>{fmtHM(b.start)}–{fmtHM(b.end)}</Pill>
          <span class="tiny">{fmtDuration(b.end - b.start)}</span>
        </div>
        {b.sub && <div class="sub">{b.sub}</div>}
        <ItemList block={b} checks={props.d.checks} today={props.d.today} />
        {sl.length > 0 && (
          <div class="card list">
            {sl.map((x) => <TaskRow key={x.task.id} task={x.task} reasons={x.reasons} onOpen={() => { props.onClose(); props.nav.task(x.task); }} />)}
          </div>
        )}
        <div class="row wrap" style={{ gap: '8px' }}>
          <ActionButton block={b} nav={{ ...props.nav, task: (t) => { props.onClose(); props.nav.task(t); } }} firstTask={sl[0]?.task} />
        </div>
      </div>
    </Sheet>
  );
}

export function CheckinSheet(props: { open: boolean; onClose: () => void }) {
  const d = useDay();
  const cur = d.dayLog.symptoms || {};
  const [belch, setBelch] = useState<number>(cur.belch ?? 3);
  const [heart, setHeart] = useState<number>(cur.heartburn ?? 1);
  const [energy, setEnergy] = useState<number>(cur.energy ?? 3);
  const [sleepQ, setSleepQ] = useState<number>(d.dayLog.sleep?.quality ?? 3);
  const [lat, setLat] = useState<number | undefined>(d.dayLog.sleep?.latency);
  const [awk, setAwk] = useState<number | undefined>(d.dayLog.sleep?.awake);
  const pick = (label: string, opts: [number, string][], v: number | undefined, set: (n: number) => void, id: string) => (
    <div class="field">
      <label>{label}</label>
      <div class="chips" id={id} role="radiogroup" aria-label={label}>
        {opts.map(([m, t]) => (
          <button key={m} role="radio" aria-checked={v === m} class={`chip ${v === m ? 'on' : ''}`} onClick={() => set(m)}>{t}</button>
        ))}
      </div>
    </div>
  );
  const [steps, setSteps] = useState<string>(d.dayLog.steps ? String(d.dayLog.steps) : '');
  const scale = (label: string, v: number, set: (n: number) => void, max: number, lo: string, hi: string, id: string) => (
    <div class="field">
      <label for={id}>{label} <b class="num" style={{ color: 'var(--ink)' }}>{v}</b></label>
      <input id={id} type="range" min={max === 10 ? 0 : 1} max={max} value={v} onInput={(e) => set(Number((e.target as HTMLInputElement).value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
      <div class="row between tiny"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
  return (
    <Sheet open={props.open} onClose={props.onClose} title="เช็คอินประจำวัน">
      <div class="stack">
        <div class="sub">ให้คะแนนตามความรู้สึกทั้งวัน ใช้ดูแนวโน้มและนำไปคุยกับหมอได้ สองข้อแรกใช้ปรับเวลานอนให้อัตโนมัติ</div>
        {pick('เมื่อคืนใช้เวลากว่าจะหลับ', [[10, '< 15 นาที'], [22, '15–30'], [45, '30–60'], [75, '> 1 ชม.']], lat, setLat, 'ci-lat')}
        {pick('ตื่นกลางดึกรวม', [[0, 'แทบไม่ตื่น'], [10, '5–15 นาที'], [22, '15–30'], [45, '30–60'], [75, '> 1 ชม.']], awk, setAwk, 'ci-awake')}
        {scale('เรอ', belch, setBelch, 10, '0 ไม่มี', '10 ทั้งวัน', 'ci-belch')}
        {scale('แสบร้อนกลางอก', heart, setHeart, 10, '0 ไม่มี', '10 หนักมาก', 'ci-heart')}
        {scale('พลังงาน', energy, setEnergy, 5, '1 หมดแรง', '5 สดชื่น', 'ci-energy')}
        {scale('การนอนเมื่อคืน', sleepQ, setSleepQ, 5, '1 แย่', '5 ดีมาก', 'ci-sleep')}
        <div class="field">
          <label for="ci-steps">จำนวนก้าววันนี้ (จากแอป Health ใน iPhone)</label>
          <input id="ci-steps" class="input" inputMode="numeric" placeholder="เช่น 8200" value={steps} onInput={(e) => setSteps((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))} />
        </div>
        <button
          class="btn primary block"
          onClick={(e) => {
            patchDay(d.today, { symptoms: { belch, heartburn: heart, energy }, sleep: { quality: sleepQ, latency: lat, awake: awk }, steps: steps ? Number(steps) : undefined, checks: { checkin: Date.now() } });
            sound.done();
            burstFrom(e, '');
            props.onClose();
          }}
        >
          บันทึกเช็คอิน
        </button>
      </div>
    </Sheet>
  );
}

export function PlanSheet(props: { open: boolean; onClose: () => void }) {
  const d = useDay();
  const tomorrow = addDays(d.today, 1);
  const tomorrowLog = d.s.logs[monthOf(tomorrow)]?.days?.[tomorrow];
  const [picked, setPicked] = useState<string[]>(tomorrowLog?.top3 || []);
  const [ai, setAi] = useState<{ summary: string; notes: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const candidates = d.ranked.filter((r) => !r.task.flow).slice(0, 15);
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 3 ? [...picked, id] : picked);
  const askClaude = async () => {
    setBusy(true);
    setErr('');
    try {
      const free = d.blocks.filter((b) => b.accepts && b.end > d.nowMin).map((b) => `${b.title} ${fmtHM(Math.max(b.start, d.nowMin))}-${fmtHM(b.end)}`).join(', ');
      const n = new Date();
      const res = await planDay(candidates.map((r) => r.task), free || 'none left today', `${dateKey(n)}T${pad(n.getHours())}:${pad(n.getMinutes())}`);
      const order = (res.order || []).filter((id) => d.s.tasks[id]);
      patchDay(d.today, { plan: order });
      setAi({ summary: res.summary || '', notes: res.notes || {} });
      toast('Claude จัดลำดับงานวันนี้ใหม่แล้ว');
    } catch (e) {
      setErr(copyForError(e));
    } finally {
      setBusy(false);
    }
  };
  const [hasAi, setHasAi] = useState(false);
  useEffect(() => {
    sampleCap().then((x) => setHasAi(!!x));
  }, []);
  return (
    <Sheet open={props.open} onClose={props.onClose} title="วางแผน">
      <div class="stack">
        {hasAi && (
          <Glass class="pad stack-sm">
            <div class="h3">ให้ Claude จัดลำดับงานวันนี้</div>
            <div class="sub">Claude ดูงานที่ค้างกับเวลาว่างที่เหลือของวันนี้ แล้วเรียงใหม่ให้ สุขภาพมาก่อน ตามด้วยรายได้ร้าน</div>
            <button class="btn primary" disabled={busy} onClick={askClaude}>{busy ? 'กำลังคิด…' : 'วางแผนวันนี้'}</button>
            {err && <div class="banner">{err}</div>}
            {ai && (
              <div class="stack-sm">
                <div class="sub">{ai.summary}</div>
                {Object.entries(ai.notes).slice(0, 6).map(([id, why]) => d.s.tasks[id] && <div key={id} class="tiny">• <b>{d.s.tasks[id].title}</b> — {why}</div>)}
              </div>
            )}
          </Glass>
        )}
        <div class="h3">3 งานสำคัญของพรุ่งนี้</div>
        <div class="sub">เลือกได้ 3 งาน ระบบจะดันขึ้นบนสุดของพรุ่งนี้</div>
        <div class="card list">
          {candidates.map((r) => (
            <div key={r.task.id} class="item">
              <Check on={picked.includes(r.task.id)} label={r.task.title} tone="var(--accent)" onToggle={() => toggle(r.task.id)} />
              <div class="grow"><div class="t">{r.task.title}</div><div class="d">{AREA_LABEL[r.task.area]}</div></div>
            </div>
          ))}
          {!candidates.length && <div class="empty">ยังไม่มีงานค้าง</div>}
        </div>
        <button
          class="btn primary block"
          onClick={(e) => {
            patchDay(tomorrow, { top3: picked, plan: picked });
            patchDay(d.today, { checks: { top3: Date.now() } });
            picked.forEach((id) => d.s.tasks[id] && saveTask({ ...d.s.tasks[id], pinned: true }));
            sound.done();
            burstFrom(e, '');
            props.onClose();
          }}
        >
          บันทึก 3 งานสำคัญ
        </button>
      </div>
    </Sheet>
  );
}

export function TodayScreen(props: { nav: Nav; alerts: Alert[] }) {
  const d = useDay();
  const { s, now, today, dayLog, ranked, checks, blocks } = d;
  const [openBlock, setOpenBlock] = useState<Block | null>(null);
  const metrics = useMemo(() => buildMetrics(s.logs, s.tasks, s.digests, s.settings, s.plan, today, now), [s.logs, s.tasks, s.digests, s.settings, s.plan, today, Math.floor(now.getTime() / 300000)]);
  const sum = (id: string) => {
    const m = metrics.find((x) => x.id === id);
    return m ? summarize(m, today) : undefined;
  };
  const routineS = sum('routine');
  const tasksS = sum('tasks');
  const sleepS = sum('sleep');
  const allItems = blocks.flatMap((b) => b.items || []);
  const doneItems = allItems.filter((i) => checks[i.id]).length;
  const name = s.plan?.profile?.name || 'Basz';
  const routinePct = allItems.length ? Math.round((doneItems / allItems.length) * 100) : 0;
  const sleptToday = sleepS?.latest?.key === today;
  const top = ranked.filter((r) => !r.task.flow).slice(0, 3);
  const unread = props.alerts.length;

  return (
    <div class="screen">
      <div class="topbar">
        <div class="grow">
          <div class="eyebrow">{fmtDayLong(today)} · {pad(now.getHours())}:{pad(now.getMinutes())}</div>
          <h1 class="h1 hello">{greeting(now.getHours())} <span class="name">{name}</span></h1>
        </div>
        <button class="icon-btn" aria-label={`แจ้งเตือน (${unread})`} onClick={props.nav.inbox}>
          {I.bell({ size: 20 })}
          {unread > 0 && <span class="dot" />}
        </button>
        <button aria-label={`กิจวัตรวันนี้ ${routinePct}% เปิดหน้าสถิติ`} style={{ border: 0, background: 'none', padding: 0 }} onClick={() => props.nav.hub('stats')}>
          <Ring value={routinePct / 100} size={44} stroke={4} tone="var(--good)" label="กิจวัตรที่ทำแล้ววันนี้">
            <span class="display-num" style={{ fontSize: '11px' }}>{routinePct}%</span>
          </Ring>
        </button>
      </div>

      <NowCard d={d} nav={props.nav} />
      <AlertsStrip alerts={props.alerts} nav={props.nav} />

      <div class="tiles">
        <div class="tile" style={{ '--tone': 'var(--good)' } as JSX.CSSProperties}>
          <div class="k">กิจวัตร</div>
          <div class="v"><CountUp value={doneItems} /><span class="tiny">/{allItems.length}</span></div>
          <Progress value={allItems.length ? doneItems / allItems.length : 0} tone="var(--good)" label="กิจวัตรที่ทำแล้ว" />
          {routineS && <Delta s={routineS} today={today} />}
        </div>
        <div class="tile" style={{ '--tone': 'var(--accent)' } as JSX.CSSProperties}>
          <div class="k">งานที่เสร็จ</div>
          <div class="v"><CountUp value={tasksS?.latest?.key === today ? tasksS.latest.value : 0} /></div>
          {tasksS?.latest?.key === today && <Delta s={tasksS} today={today} />}
        </div>
        <button class="tile" style={{ '--tone': 'var(--a-home)', textAlign: 'left', border: 0, color: 'inherit' } as JSX.CSSProperties} onClick={sleptToday ? () => props.nav.hub('stats') : props.nav.checkin}>
          <div class="k">การนอน</div>
          <div class="v">{sleptToday ? sleepS!.latest!.value.toFixed(1) : '–'}<span class="tiny"> ชม.</span></div>
          {sleptToday ? <Delta s={sleepS!} today={today} /> : <div class="tiny">เช็คอินเพื่อบันทึก</div>}
        </button>
      </div>

      <div class="section-head">
        <h2 class="h2">งานสำคัญที่สุด</h2>
        <button class="chip" onClick={props.nav.plan}>{I.spark({ size: 14 })} วางแผน</button>
      </div>
      <Glass class="list">
        {top.length ? top.map((r) => <TaskRow key={r.task.id} task={r.task} reasons={r.reasons} onOpen={() => props.nav.task(r.task)} />) : <div class="empty">ยังไม่มีงาน พิมพ์ด้านล่างได้เลย</div>}
      </Glass>
      <TaskComposer id="today-composer" onSubmit={(t, m) => props.nav.add(t, m)} />

      <Timeline d={d} onOpen={setOpenBlock} />

      <div class="row wrap" style={{ gap: '8px', justifyContent: 'center' }}>
        <button
          class={`chip ${dayLog.nightOut ? 'on' : ''}`}
          onClick={() => {
            patchDay(today, { nightOut: !dayLog.nightOut });
            toast(dayLog.nightOut ? 'ปิดโหมดเที่ยวกลางคืนแล้ว' : 'เปิดโหมดเที่ยวกลางคืน · พรุ่งนี้เป็นเช้าพักฟื้น');
          }}
        >
          {I.moon({ size: 14 })} {dayLog.nightOut ? 'คืนนี้ไปเที่ยว' : 'คืนนี้ออกไปเที่ยวไหม?'}
        </button>
        <button class="chip" onClick={props.nav.checkin}>{I.stethoscope({ size: 14 })} เช็คอิน</button>
      </div>

      <BlockSheet block={openBlock} d={d} nav={props.nav} onClose={() => setOpenBlock(null)} />
    </div>
  );
}
