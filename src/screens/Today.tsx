import { Fragment, type JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { I } from '../components/icons';
import { burstFrom, Check, Glass, Pill, Progress, Ring, Sheet, toast, toneOf } from '../components/ui';
import { completeTask, patchDay, saveTask, setCheck, snooze } from '../lib/actions';
import { copyForError, planDay, sampleCap } from '../lib/ai';
import type { Alert } from '../lib/alerts';
import { useNow, useStore } from '../lib/hooks';
import type { Nav } from '../lib/nav';
import { AREA_LABEL, rankTasks, slotTasks } from '../lib/priority';
import { buildDay, currentBlock, type Block } from '../lib/schedule';
import { sound } from '../lib/sound';
import { addDays, dateKey, fmtDayLong, fmtDuration, fmtHM, logicalMinutes, monthOf, pad, parseHM, todayKey } from '../lib/time';
import type { DayLog, Task } from '../lib/types';
import { computeStats } from '../lib/xp';
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
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Late night';
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
                  burstFrom(e, it.id === 'lights-out' ? '+20 XP' : '+5 XP', it.kind === 'med' ? 'var(--a-growth)' : undefined);
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
      return props.firstTask ? <button class="btn primary" onClick={() => n.task(props.firstTask!)}>{I.arrow({ size: 18 })} Open task</button> : null;
    case 'workout':
      return <button class="btn primary" onClick={() => n.workout(b.program || 'A')}>{I.play({ size: 18 })} Start {b.title}</button>;
    case 'breath':
      return <button class="btn primary" onClick={() => n.breath(b.id === 'read' ? 'sleep' : 'meal')}>{I.wave({ size: 18 })} Start breathing</button>;
    case 'walk':
      return <button class="btn primary" onClick={() => n.breath('daily')}>{I.clock({ size: 18 })} Walk timer</button>;
    case 'laundry':
      return <button class="btn primary" onClick={() => n.hub('laundry')}>{I.shirt({ size: 18 })} Start laundry</button>;
    case 'plan':
      return <button class="btn primary" onClick={() => n.plan()}>{I.spark({ size: 18 })} Plan it</button>;
    case 'checkin':
      return <button class="btn" onClick={() => n.checkin()}>{I.stethoscope({ size: 18 })} Check-in</button>;
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
        <div class="eyebrow">Up next · {next ? fmtHM(next.start) : ''}</div>
        <div class="h1" style={{ margin: '6px 0 4px' }}>{next ? next.title : 'Free time'}</div>
        <div class="sub">{next ? `in ${fmtDuration(mins)} · ${next.sub || ''}` : 'Nothing scheduled right now.'}</div>
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
        <div class="row between"><span class="eyebrow">Now · Sleep</span>{I.moon({ size: 20 })}</div>
        <div class="h1" style={{ margin: '8px 0 4px' }}>Time to sleep</div>
        <div class="sub">Wake at {s.settings.wake} · {fmtDuration(toWake)} left. ถ้า 20 นาทียังไม่หลับ ลุกไปนั่งที่แสงสลัวก่อน</div>
      </Glass>
    );
  }
  return (
    <Glass class="hero" tone={tone}>
      <div class="glow" />
      <div class="row between">
        <Pill tone={tone}>NOW · {fmtHM(cur.start)}–{fmtHM(cur.end)}</Pill>
        <span class="tiny num">{fmtDuration(left)} left</span>
      </div>
      <h2 class="h1" style={{ margin: '10px 0 2px' }}>{cur.title}</h2>
      {cur.sub && <div class="sub">{cur.sub}</div>}
      <div style={{ margin: '12px 0' }}><Progress value={done / total} tone={tone} label="Block progress" /></div>
      {items.length > 0 && <ItemList block={cur} checks={checks} today={today} compact />}
      {firstTask && (
        <div class="card pad" style={{ margin: '8px 0 4px' }}>
          <div class="eyebrow">Most important now</div>
          <div class="h3" style={{ marginTop: '2px' }}>{firstTask.title}</div>
          <div class="tiny">{AREA_LABEL[firstTask.area]} · {firstTask.estimateMin || 25} min</div>
        </div>
      )}
      <div class="row wrap" style={{ gap: '8px', marginTop: '10px' }}>
        <ActionButton block={cur} nav={props.nav} firstTask={firstTask} />
        {next && <span class="tiny">Next · {fmtHM(next.start)} {next.title}</span>}
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
          <span style={{ color: a.urgent ? 'var(--warn)' : 'var(--ink-2)' }}>{a.kind === 'med' ? I.pill() : a.kind === 'flow' ? I.shirt() : a.kind === 'followup' ? I.user() : I.clock()}</span>
          <div class="grow">
            <div class="t">{a.title}</div>
            {a.body && <div class="d">{a.body}</div>}
          </div>
          {a.task && a.kind === 'flow' && (
            <div class="row" style={{ gap: '6px' }}>
              <button class="btn small ghost" onClick={() => { snooze(a.task!, 30); toast('Snoozed 30 min'); }}>Later</button>
              <button class="btn small" onClick={(e) => { completeTask(a.task!); sound.done(); burstFrom(e, '+20 XP'); }}>Done</button>
            </div>
          )}
          {a.task && a.kind !== 'flow' && <button class="btn small" onClick={() => props.nav.task(a.task!)}>Open</button>}
        </div>
      ))}
    </Glass>
  );
}

function Timeline(props: { d: ReturnType<typeof useDay>; onOpen: (b: Block) => void }) {
  const { blocks, nowMin, checks, slots, s } = props.d;
  const cutoff = parseHM(s.settings.coffeeCutoff, s.settings.rolloverHour);
  const [full, setFull] = useState(false);
  const visible = full ? blocks : blocks.filter((b) => b.end > nowMin - 30).slice(0, 7);
  let markerShown = false;
  return (
    <Glass class="pad">
      <div class="section-head" style={{ padding: '0 0 8px' }}>
        <h2 class="h2">Today</h2>
        <button class="chip" onClick={() => setFull(!full)}>{full ? 'Show less' : 'Full day'}</button>
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
              {showMarker && <div class="marker">☕ {s.settings.coffeeCutoff} caffeine cut-off</div>}
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
  const [steps, setSteps] = useState<string>(d.dayLog.steps ? String(d.dayLog.steps) : '');
  const scale = (label: string, v: number, set: (n: number) => void, max: number, lo: string, hi: string, id: string) => (
    <div class="field">
      <label for={id}>{label} <b class="num" style={{ color: 'var(--ink)' }}>{v}</b></label>
      <input id={id} type="range" min={max === 10 ? 0 : 1} max={max} value={v} onInput={(e) => set(Number((e.target as HTMLInputElement).value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
      <div class="row between tiny"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Daily check-in">
      <div class="stack">
        <div class="sub">ให้คะแนนตามความรู้สึกทั้งวัน ใช้ดูแนวโน้มและนำไปคุยกับหมอได้</div>
        {scale('Belching', belch, setBelch, 10, '0 ไม่มี', '10 ทั้งวัน', 'ci-belch')}
        {scale('Heartburn / reflux', heart, setHeart, 10, '0 ไม่มี', '10 หนักมาก', 'ci-heart')}
        {scale('Energy', energy, setEnergy, 5, '1 หมดแรง', '5 สดชื่น', 'ci-energy')}
        {scale('Last night’s sleep', sleepQ, setSleepQ, 5, '1 แย่', '5 ดีมาก', 'ci-sleep')}
        <div class="field">
          <label for="ci-steps">Steps today (from iPhone Health)</label>
          <input id="ci-steps" class="input" inputMode="numeric" placeholder="เช่น 8200" value={steps} onInput={(e) => setSteps((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''))} />
        </div>
        <button
          class="btn primary block"
          onClick={(e) => {
            patchDay(d.today, { symptoms: { belch, heartburn: heart, energy }, sleep: { quality: sleepQ }, steps: steps ? Number(steps) : undefined, checks: { checkin: Date.now() } });
            sound.done();
            burstFrom(e, '+5 XP');
            props.onClose();
          }}
        >
          Save check-in
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
      toast('Today re-ordered by Claude');
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
    <Sheet open={props.open} onClose={props.onClose} title="Plan">
      <div class="stack">
        {hasAi && (
          <Glass class="pad stack-sm">
            <div class="h3">Re-order today with Claude</div>
            <div class="sub">Claude reads your open tasks and the free blocks left today, then puts health first and revenue next.</div>
            <button class="btn primary" disabled={busy} onClick={askClaude}>{busy ? 'Thinking…' : 'Plan today'}</button>
            {err && <div class="banner">{err}</div>}
            {ai && (
              <div class="stack-sm">
                <div class="sub">{ai.summary}</div>
                {Object.entries(ai.notes).slice(0, 6).map(([id, why]) => d.s.tasks[id] && <div key={id} class="tiny">• <b>{d.s.tasks[id].title}</b> — {why}</div>)}
              </div>
            )}
          </Glass>
        )}
        <div class="h3">Tomorrow's top 3</div>
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
            burstFrom(e, '+5 XP');
            props.onClose();
          }}
        >
          Save top 3
        </button>
      </div>
    </Sheet>
  );
}

export function TodayScreen(props: { nav: Nav; alerts: Alert[] }) {
  const d = useDay();
  const { s, now, today, dayLog, ranked, checks, blocks } = d;
  const [openBlock, setOpenBlock] = useState<Block | null>(null);
  const stats = useMemo(() => computeStats(s.logs, s.tasks, s.plan, today, d.R), [s.logs, s.tasks, s.plan, today]);
  const allItems = blocks.flatMap((b) => b.items || []);
  const doneItems = allItems.filter((i) => checks[i.id]).length;
  const name = s.plan?.profile?.name || 'Basz';
  const lvProg = (stats.xp - stats.levelFloor) / Math.max(1, stats.levelNext - stats.levelFloor);
  const top = ranked.filter((r) => !r.task.flow).slice(0, 3);
  const unread = props.alerts.length;

  return (
    <div class="screen">
      <div class="topbar">
        <div class="grow">
          <div class="eyebrow">{fmtDayLong(today)} · {pad(now.getHours())}:{pad(now.getMinutes())}</div>
          <h1 class="h1">{greeting(now.getHours())}, {name}</h1>
        </div>
        <button class="icon-btn" aria-label={`Notifications (${unread})`} onClick={props.nav.inbox}>
          {I.bell({ size: 20 })}
          {unread > 0 && <span class="dot" />}
        </button>
        <button aria-label={`Level ${stats.level}, open stats`} style={{ border: 0, background: 'none', padding: 0 }} onClick={() => props.nav.hub('stats')}>
          <Ring value={lvProg} size={44} stroke={4} label={`Level ${stats.level}`}>
            <span class="display-num" style={{ fontSize: '14px' }}>{stats.level}</span>
          </Ring>
        </button>
      </div>

      <NowCard d={d} nav={props.nav} />
      <AlertsStrip alerts={props.alerts} nav={props.nav} />

      <div class="tiles">
        <div class="tile">
          <div class="k">ROUTINE</div>
          <div class="v">{doneItems}<span class="tiny">/{allItems.length}</span></div>
          <Progress value={allItems.length ? doneItems / allItems.length : 0} tone="var(--good)" label="Routine done" />
        </div>
        <div class="tile">
          <div class="k">TASKS DONE</div>
          <div class="v">{stats.tasks.doneToday}</div>
          <div class="tiny">{stats.tasks.doneWeek} this week</div>
        </div>
        <div class="tile">
          <div class="k">XP TODAY</div>
          <div class="v">{stats.todayXp}</div>
          <div class="tiny row" style={{ gap: '4px' }}><span style={{ color: 'var(--warn)' }}>{I.flame({ size: 14 })}</span>{stats.sleep.streak} night streak</div>
        </div>
      </div>

      <div class="section-head">
        <h2 class="h2">Top of your list</h2>
        <button class="chip" onClick={props.nav.plan}>{I.spark({ size: 14 })} Plan</button>
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
            toast(dayLog.nightOut ? 'Night out removed' : 'Night out mode on · tomorrow becomes a recovery morning');
          }}
        >
          {I.moon({ size: 14 })} {dayLog.nightOut ? 'Night out tonight' : 'Going out tonight?'}
        </button>
        <button class="chip" onClick={props.nav.checkin}>{I.stethoscope({ size: 14 })} Check-in</button>
      </div>

      <BlockSheet block={openBlock} d={d} nav={props.nav} onClose={() => setOpenBlock(null)} />
    </div>
  );
}
