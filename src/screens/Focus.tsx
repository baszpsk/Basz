// Pomodoro 25/5: the timer sheet, the bar that follows him across tabs while
// a round runs, and the statistics page. Every round is recorded in full
// (start, end, planned vs counted time, pauses, how it ended, the task).

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { BarChart, HeatMap } from '../components/charts';
import { I } from '../components/icons';
import { RangeBar, useRange } from '../components/range';
import { burstFrom, Empty, Glass, PageHead, Ring, Sheet, toast } from '../components/ui';
import { saveMeta } from '../lib/actions';
import { cap } from '../lib/claude';
import { focusCsv, focusPeriod, focusReport, isFull, secOf, type PeriodFocus, type Round } from '../lib/focusstats';
import { useNow, useStore } from '../lib/hooks';
import type { Nav } from '../lib/nav';
import * as P from '../lib/pomodoro';
import { AREA_LABEL, rankTasks } from '../lib/priority';
import { periodOf } from '../lib/range';
import { sound } from '../lib/sound';
import { store } from '../lib/store';
import { fmtClock, fmtDuration, fmtShortDate, pad, todayKey } from '../lib/time';
import type { Pomo, Task } from '../lib/types';

const hm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const mins = (sec: number) => Math.round(sec / 60);
const pct = (x?: number) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const one = (x?: number) => (x == null ? '–' : x.toFixed(1));
/** เวลาแบบสั้นสำหรับช่องตัวเลข: ต่ำกว่าชั่วโมงเป็นนาที ที่เหลือเป็นชั่วโมงทศนิยมเดียว */
const hrs = (min: number) => (min < 59.5 ? `${Math.round(min)} นาที` : `${(min / 60).toFixed(1)} ชม.`);

/** Closes rounds that ran out, chimes, and keeps the screen awake while a round runs. Mounted once. */
export function usePomodoroClock() {
  const s = useStore();
  const p = s.meta.pomo;
  const live = !!p && p.phase !== 'idle';
  const awake = live && !!p?.running && s.meta.keepAwake !== false;
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      const done = P.sync();
      if (!done.length || document.visibilityState !== 'visible') return;
      const f = store.s.settings.focus;
      sound.chime();
      toast(done[done.length - 1] === 'work' ? (f.autoBreak ? `ครบ ${f.work} นาที · พัก ${f.rest} นาที` : `ครบ ${f.work} นาที`) : 'พักครบแล้ว เริ่มรอบต่อไปได้');
    };
    tick();
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [live]);
  useEffect(() => {
    if (!awake) return;
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const get = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await (navigator as any).wakeLock?.request('screen');
        if (alive) lock = l;
        else l?.release();
      } catch {
        /* not allowed in this frame or not supported */
      }
    };
    get();
    document.addEventListener('visibilitychange', get);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', get);
      lock?.release().catch(() => {});
    };
  }, [awake]);
}

function phaseLabel(p: Pomo) {
  if (p.phase === 'idle') return 'พร้อมเริ่ม';
  if (p.phase === 'work') return p.running ? 'โฟกัส' : 'หยุดชั่วคราว';
  return p.running ? 'พัก' : 'หยุดพักชั่วคราว';
}

/** Small pill above the tab bar while a round is on. */
export function FocusBar(props: { hidden: boolean; onOpen: () => void }) {
  const s = useStore();
  const now = useNow(1000);
  const p = { ...P.IDLE, ...(s.meta.pomo || {}) };
  if (props.hidden || p.phase === 'idle') return null;
  const tone = p.phase === 'break' ? 'var(--good)' : 'var(--accent)';
  return (
    <button class="focusbar glass" style={{ '--tone': tone } as JSX.CSSProperties} onClick={props.onOpen} aria-label={`${phaseLabel(p)} เหลือ ${fmtClock(P.remainingSec(p, now.getTime()))} แตะเพื่อเปิดตัวจับเวลา`}>
      <span class="dot" />
      <span>{phaseLabel(p)}</span>
      <b class="num">{fmtClock(P.remainingSec(p, now.getTime()))}</b>
    </button>
  );
}

function TodayDots(props: { rows: Round[]; today: string }) {
  const works = props.rows.filter((r) => r.kind === 'work' && r.day === props.today);
  if (!works.length) return null;
  return (
    <div class="pomo-dots" role="img" aria-label={`วันนี้ครบ ${works.filter(isFull).length} รอบ หยุดก่อนครบ ${works.filter((r) => !isFull(r)).length} รอบ`}>
      {works.map((r) => <span key={r.id} class={isFull(r) ? 'on' : ''} />)}
    </div>
  );
}

export function FocusSheet(props: { open: boolean; onClose: () => void; nav: Nav }) {
  const s = useStore();
  const now = useNow(1000);
  const [confirm, setConfirm] = useState<'stop' | 'break' | null>(null);
  const [picking, setPicking] = useState(false);
  const p = { ...P.IDLE, ...(s.meta.pomo || {}) };
  const f = s.settings.focus;
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const minute = Math.floor(now.getTime() / 60000);
  const rep = useMemo(() => focusReport(s.logs, R, f.rest, today, now), [s.logs, today, minute]);
  const ranked = useMemo(() => rankTasks(Object.values(s.tasks), now.getTime(), today, R).slice(0, 4), [s.tasks, today, minute]);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirm]);

  const left = p.phase === 'idle' ? f.work * 60 : P.remainingSec(p, now.getTime());
  const total = p.phase === 'idle' ? f.work * 60 : p.plannedSec;
  const tone = p.phase === 'break' ? 'var(--good)' : 'var(--accent)';
  const ends = P.endsAt(p);
  const openPause = p.pauses.find((x) => x.e == null);
  const link = (t: Task | null) => {
    P.setLink(t ? { taskId: t.id, label: t.title, area: t.area } : P.NO_LINK);
    setPicking(false);
  };
  const start = (e: Event) => {
    sound.unlock();
    P.startWork();
    burstFrom(e, `${f.work} นาที`);
  };
  const stop = () => {
    if (p.phase === 'work' && confirm !== 'stop') return setConfirm('stop');
    setConfirm(null);
    const wasWork = p.phase === 'work';
    const kept = P.stop();
    toast(wasWork ? (kept ? 'บันทึกรอบนี้แล้ว (หยุดก่อนครบ)' : 'ไม่บันทึก เพราะสั้นกว่า 1 นาที') : 'จบพักแล้ว');
  };
  const rest = (e: Event) => {
    // ตัดโฟกัสที่ทำมาถึง 1 นาทีแล้วต้องแตะยืนยันอีกครั้ง เพราะรอบนั้นจะถูกบันทึกว่าไม่ครบ
    if (p.phase === 'work' && P.activeSec(p) >= P.MIN_WORK_SEC && confirm !== 'break') return setConfirm('break');
    setConfirm(null);
    sound.unlock();
    const wasWork = p.phase === 'work';
    const kept = P.startBreak();
    burstFrom(e, `พัก ${f.rest} นาที`);
    if (wasWork) toast(kept ? 'บันทึกโฟกัสแล้ว (หยุดเพื่อพัก)' : 'ไม่บันทึกโฟกัส เพราะสั้นกว่า 1 นาที');
  };

  return (
    <Sheet open={props.open} onClose={props.onClose} title={`Pomodoro ${f.work}/${f.rest}`}>
      <div class="stack" style={{ alignItems: 'center' }}>
        <Ring value={p.phase === 'idle' ? 0 : 1 - left / total} size={232} stroke={12} tone={tone} label={`${phaseLabel(p)} เหลือ ${fmtClock(left)}`}>
          <div class="center">
            <div class="eyebrow">{phaseLabel(p)}</div>
            <div class="display-num" style={{ fontSize: '52px', lineHeight: 1.05 }}>{fmtClock(left)}</div>
            <div class="tiny">
              {p.phase === 'idle' ? `โฟกัส ${f.work} · พัก ${f.rest} นาที` : ends ? (p.phase === 'work' ? `ครบเวลา ${hm(ends)}` : `พักถึง ${hm(ends)}`) : openPause ? `หยุดมา ${mins((now.getTime() - openPause.s) / 1000)} นาที` : ''}
            </div>
          </div>
        </Ring>

        <div class="tiny center">
          วันนี้ครบ <b class="num">{rep.today.done}</b> รอบ · โฟกัส <b class="num">{mins(rep.today.focusSec)}</b> นาที
          {rep.today.stopped > 0 && <> · หยุดก่อนครบ <b class="num">{rep.today.stopped}</b></>}
        </div>
        <TodayDots rows={rep.rows} today={today} />

        <div class="row wrap" style={{ gap: '8px', justifyContent: 'center' }}>
          {p.phase === 'idle' && (
            <>
              <button class="btn primary" id="pomo-start" onClick={(e) => start(e as unknown as Event)}>{I.play({ size: 18 })} เริ่มโฟกัส {f.work} นาที</button>
              <button class="btn" id="pomo-break" onClick={(e) => rest(e as unknown as Event)}>{I.moon({ size: 18 })} พัก {f.rest} นาที</button>
            </>
          )}
          {p.phase === 'work' && (p.running ? (
            <button class="btn" id="pomo-pause" onClick={() => P.pause()}>{I.pause({ size: 18 })} หยุดชั่วคราว</button>
          ) : (
            <button class="btn primary" id="pomo-resume" onClick={() => P.resume()}>{I.play({ size: 18 })} ทำต่อ</button>
          ))}
          {p.phase === 'work' && (
            <button class={`btn ${confirm === 'break' ? 'danger' : ''}`} id="pomo-break" onClick={(e) => rest(e as unknown as Event)}>{I.moon({ size: 18 })} {confirm === 'break' ? 'แตะอีกครั้งเพื่อพักเลย' : `พักเลย ${f.rest} นาที`}</button>
          )}
          {p.phase === 'break' && (
            <button class="btn primary" id="pomo-skip" onClick={(e) => start(e as unknown as Event)}>{I.skip({ size: 18 })} ข้ามพัก เริ่มรอบต่อไป</button>
          )}
          {p.phase !== 'idle' && (
            <button class={`btn ${confirm === 'stop' ? 'danger' : ''}`} id="pomo-stop" onClick={stop}>{I.stop({ size: 18 })} {p.phase === 'break' ? 'จบพัก' : confirm === 'stop' ? 'แตะอีกครั้งเพื่อจบก่อนครบ' : 'จบรอบนี้'}</button>
          )}
        </div>

        <div class="card pad stack-sm" style={{ width: '100%' }}>
          <div class="row between">
            <div class="grow">
              <div class="tiny">งานที่ทำในรอบนี้</div>
              <div class="t" style={{ fontWeight: 650 }}>{p.label || 'ไม่ได้เลือกงาน'}</div>
            </div>
            <button class="chip" onClick={() => setPicking(!picking)}>{picking ? 'ปิด' : 'เลือกงาน'}</button>
          </div>
          {picking && (
            <div class="chips" style={{ flexWrap: 'wrap' }}>
              {ranked.map((r) => (
                <button key={r.task.id} class={`chip ${p.taskId === r.task.id ? 'on' : ''}`} onClick={() => link(r.task)}>{r.task.title}</button>
              ))}
              <button class={`chip ${!p.taskId ? 'on' : ''}`} onClick={() => link(null)}>ไม่ผูกงาน</button>
            </div>
          )}
        </div>

        <div class="row wrap" style={{ gap: '8px', justifyContent: 'center' }}>
          <button class={`chip ${s.meta.keepAwake !== false ? 'on' : ''}`} aria-pressed={s.meta.keepAwake !== false} onClick={() => saveMeta({ keepAwake: s.meta.keepAwake === false })}>
            {I.sun({ size: 14 })} จอไม่ดับระหว่างจับเวลา
          </button>
          <button class="chip" onClick={() => { props.onClose(); props.nav.hub('focus'); }}>{I.chart({ size: 14 })} ดูสถิติทั้งหมด</button>
        </div>
        <div class="tiny center">ถ้าจอล็อก แอปส่งเสียงเตือนไม่ได้ แต่เวลายังนับต่อ และรอบที่ครบจะบันทึกตามเวลาที่ครบจริง</div>
      </div>
    </Sheet>
  );
}

function Row(props: { k: string; v: string; sub?: string }) {
  return (
    <div class="item" style={{ padding: '10px 2px' }}>
      <div class="grow">
        <div class="t">{props.k}</div>
        {props.sub && <div class="d">{props.sub}</div>}
      </div>
      <b class="num">{props.v}</b>
    </div>
  );
}

/** ตัวเลขหลักหนึ่งช่อง ลูกศรกับสีบอกว่าดีขึ้นหรือแย่ลงจากช่วงก่อนหน้า และบอกค่าของช่วงก่อนหน้าไว้ด้วย */
function Kpi(props: { k: string; v: string; now?: number; before?: number; beforeText?: string; fmt: (n: number) => string; better?: 'up' | 'down' }) {
  const has = props.now != null && props.before != null;
  const d = has ? props.now! - props.before! : 0;
  const same = Math.abs(d) < 0.5;
  const good = (props.better ?? 'up') === 'up' ? d > 0 : d < 0;
  const tone = same ? 'var(--ink-3)' : good ? 'var(--good)' : 'var(--bad)';
  return (
    <div class="tile kpi">
      <div class="k">{props.k}</div>
      <div class="v">{props.v}</div>
      {has && (
        <span class="delta" style={{ '--tone': tone } as JSX.CSSProperties}>
          {same ? '= เท่าเดิม' : `${d > 0 ? '▲ +' : '▼ −'}${props.fmt(Math.abs(d))}`}
          <span class="vs">ก่อนหน้า {props.beforeText ?? props.fmt(props.before!)}</span>
        </span>
      )}
    </div>
  );
}

function PeriodRecords(props: { pf: PeriodFocus; title: string }) {
  const { pf } = props;
  return (
    <Glass class="pad stack-sm">
      <div class="h3">สถิติสูงสุด · {props.title}</div>
      <div class="list">
        <Row k="วันที่ทำครบมากที่สุด" v={pf.best ? `${pf.best.done} รอบ` : '–'} sub={pf.best ? fmtShortDate(pf.best.key) : undefined} />
        <Row k="ทำติดกันนานที่สุด" v={`${pf.longestStreak} วัน`} sub="วันที่ครบอย่างน้อย 1 รอบ" />
        <Row k="ครบติดกันมากที่สุดในวันเดียว" v={`${pf.longestChain.n} รอบ`} sub={pf.longestChain.key ? fmtShortDate(pf.longestChain.key) : undefined} />
        <Row k="รวมทั้งช่วง" v={`${pf.cur.done} รอบ`} sub={`โฟกัส ${fmtDuration(pf.cur.focusSec / 60)} · หยุดก่อนครบ ${pf.cur.stopped} รอบ`} />
      </div>
    </Glass>
  );
}

function Log(props: { rows: Round[]; tasks: Record<string, Task> }) {
  const [n, setN] = useState(12);
  const recent = props.rows.slice(-n).reverse();
  return (
    <Glass class="pad stack-sm">
      <div class="h3">บันทึกทุกรอบในช่วงนี้</div>
      <div class="tiny">ล่าสุดอยู่บน · แสดง {recent.length} จาก {props.rows.length} รอบ</div>
      <div class="list">
        {recent.map((r) => {
          const ended = r.endedBy === 'skip' ? 'ข้ามพัก' : r.endedBy === 'break' ? 'หยุดเพื่อพัก' : isFull(r) ? 'ครบ' : 'หยุดก่อนครบ';
          const task = r.taskId ? props.tasks[r.taskId]?.title || r.label : undefined;
          return (
            <div key={r.id} class="item" style={{ padding: '9px 2px' }}>
              <span style={{ color: r.kind === 'work' ? 'var(--accent)' : 'var(--good)' }}>{r.kind === 'work' ? I.focus({ size: 18 }) : I.moon({ size: 18 })}</span>
              <div class="grow">
                <div class="t">{r.kind === 'work' ? 'โฟกัส' : 'พัก'} · {ended}</div>
                <div class="d">
                  {fmtShortDate(r.day)} {hm(r.start)}–{hm(r.end)} · นับ {one(secOf(r) / 60)}/{r.plannedSec ? Math.round(r.plannedSec / 60) : '–'} นาที
                  {!!r.pauses?.length && ` · หยุดชั่วคราว ${r.pauses.length} ครั้ง ${one((r.pausedSec || 0) / 60)} นาที`}
                  {task && ` · ${task}`}
                  {r.area && ` · ${AREA_LABEL[r.area]}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {props.rows.length > n && (
        <button class="btn small ghost" onClick={() => setN(n + 40)}>แสดงเพิ่มอีก {Math.min(40, props.rows.length - n)} รอบ</button>
      )}
    </Glass>
  );
}

const UNIT_NAME = { hour: 'ชั่วโมง', day: 'วัน', week: 'สัปดาห์', month: 'เดือน' } as const;

export function FocusPage(props: { back: () => void; nav: Nav }) {
  const s = useStore();
  const now = useNow(30000);
  const f = s.settings.focus;
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const minute = Math.floor(now.getTime() / 60000);
  const rep = useMemo(() => focusReport(s.logs, R, f.rest, today, now), [s.logs, today, minute]);
  const [sel, setSel] = useRange('basz-os.focus-range', 'week', today);
  const period = useMemo(() => periodOf(sel, today, rep.first, R, now), [sel, today, rep.first, minute]);
  const pf = useMemo(() => focusPeriod(rep.rows, period, s.tasks, f.rest, R, today, now, rep.first), [rep, period, s.tasks]);
  const p = { ...P.IDLE, ...(s.meta.pomo || {}) };
  const q = pf.quality;
  const cmp = pf.prev;
  const unitName = UNIT_NAME[period.unit];
  const every = period.unit === 'hour' ? 6 : pf.buckets.length <= 7 ? 1 : Math.ceil(pf.buckets.length / 6);
  const hours = Array.from({ length: 24 }, (_, i) => (R + i) % 24);
  const exportCsv = async () => {
    const downloads = await cap('downloads');
    if (!downloads) return toast('หน้านี้ดาวน์โหลดไฟล์ไม่ได้');
    try {
      await downloads.save({ filename: `basz-os-pomodoro-${today}.csv`, data: focusCsv(rep.rows, s.tasks) });
      toast('บันทึกไฟล์แล้ว');
    } catch (e: any) {
      toast(e?.code === 'declined' ? 'ยังไม่ได้บันทึกไฟล์' : 'บันทึกไฟล์ไม่สำเร็จ');
    }
  };

  return (
    <div class="screen">
      <PageHead title={`โฟกัส ${f.work}/${f.rest}`} eyebrow="Pomodoro · สถิติทุกรอบ" onBack={props.back} />
      <Glass class="hero" tone="var(--accent)">
        <div class="glow" />
        <div class="eyebrow">วันนี้</div>
        <div class="tiles" style={{ marginTop: '10px' }}>
          <div class="tile" style={{ '--tone': 'var(--accent)' } as JSX.CSSProperties}>
            <div class="k">ครบ</div>
            <div class="v">{rep.today.done}<span class="tiny"> รอบ</span></div>
            {rep.pace && <div class="tiny">เมื่อวานเวลานี้ {rep.pace.done}</div>}
          </div>
          <div class="tile" style={{ '--tone': 'var(--accent)' } as JSX.CSSProperties}>
            <div class="k">โฟกัส</div>
            <div class="v">{mins(rep.today.focusSec)}<span class="tiny"> นาที</span></div>
            {rep.pace && <div class="tiny">เมื่อวานเวลานี้ {mins(rep.pace.focusSec)}</div>}
          </div>
          <div class="tile" style={{ '--tone': 'var(--warn)' } as JSX.CSSProperties}>
            <div class="k">หยุดชั่วคราว</div>
            <div class="v">{rep.today.pauses}<span class="tiny"> ครั้ง</span></div>
            <div class="tiny">{one(rep.today.pausedSec / 60)} นาที</div>
          </div>
        </div>
        <div class="tiny" style={{ marginTop: '10px' }}>
          {rep.today.firstStart ? `เริ่มรอบแรก ${hm(rep.today.firstStart)} · จบล่าสุด ${hm(rep.today.lastEnd!)} · หยุดก่อนครบ ${rep.today.stopped} · พักครบ ${rep.today.restsFull} · ตัดพัก ${rep.today.restsCut} · ครบติดกันสูงสุด ${rep.today.chain} รอบ` : 'วันนี้ยังไม่มีรอบที่บันทึก'}
          {rep.streak > 0 && ` · ทำติดกัน ${rep.streak} วัน`}
        </div>
        <button class="btn primary block" style={{ marginTop: '12px' }} onClick={() => props.nav.focus()}>
          {p.phase === 'idle' ? <>{I.play({ size: 18 })} เริ่มโฟกัส {f.work} นาที</> : <>{I.clock({ size: 18 })} เปิดตัวจับเวลา · {phaseLabel(p)}</>}
        </button>
      </Glass>

      {rep.rows.length === 0 ? (
        <Glass><Empty title="ยังไม่มีรอบที่บันทึก" body={`กดเริ่มโฟกัส ${f.work} นาที แล้วสถิติทุกอย่างจะขึ้นที่นี่เอง`} /></Glass>
      ) : (
        <>
          <RangeBar sel={sel} period={period} onChange={setSel} today={today} first={rep.first} id="focus-range" />

          <Glass class="pad stack-sm">
            <div class="row between" style={{ alignItems: 'baseline' }}>
              <div class="h3">สรุป</div>
              {period.prev && cmp && <span class="tiny">เทียบ{period.prev.label}</span>}
            </div>
            <div class="tiles two">
              <Kpi k="รอบที่ครบ" v={`${pf.cur.done} รอบ`} now={pf.cur.done} before={cmp?.done} fmt={(n) => `${Math.round(n)} รอบ`} />
              <Kpi k="เวลาโฟกัส" v={hrs(pf.cur.focusSec / 60)} now={pf.cur.focusSec / 60} before={cmp ? cmp.focusSec / 60 : undefined} fmt={hrs} />
              <Kpi k="ทำครบรอบ" v={pct(pf.cur.rate)} now={pf.cur.rate != null ? pf.cur.rate * 100 : undefined} before={cmp?.rate != null ? cmp.rate * 100 : undefined} fmt={(n) => `${Math.round(n)}%`} />
              {period.kind === 'day' ? (
                <Kpi k="ครบติดกันมากที่สุด" v={`${pf.longestChain.n} รอบ`} fmt={(n) => `${n} รอบ`} />
              ) : (
                <Kpi k="วันที่ได้ทำ" v={`${pf.cur.activeDays}/${pf.curDays} วัน`} now={pf.cur.activeDays} before={cmp?.activeDays} beforeText={cmp ? `${cmp.activeDays}/${pf.prevDays} วัน` : undefined} fmt={(n) => `${n} วัน`} />
              )}
            </div>
            {period.prev && !cmp && <div class="tiny">ยังไม่มีบันทึกใน{period.prev.name} จึงยังไม่มีตัวเลขให้เทียบ</div>}
          </Glass>

          {pf.cur.done + pf.cur.stopped === 0 ? (
            <Glass><Empty title={`ไม่มีรอบโฟกัสใน${period.title}`} body="เลือกช่วงอื่นด้านบน หรือเริ่มโฟกัสรอบใหม่" /></Glass>
          ) : (
            <>
              <Glass class="pad stack-sm">
                <div class="h3">รอบที่ครบแต่ละ{unitName}</div>
                <BarChart
                  data={pf.buckets.map((x) => ({
                    key: x.b.key,
                    label: x.b.label,
                    tick: x.b.tick,
                    value: x.b.future ? undefined : x.done,
                    sub: `โฟกัส ${fmtDuration(x.focusSec / 60)}${x.stopped ? ` · หยุดก่อนครบ ${x.stopped}` : ''}`,
                  }))}
                  unit="รอบ"
                  title={`รอบที่ครบแต่ละ${unitName} ${period.title}`}
                  tone="var(--accent)"
                  every={every}
                  labelLast
                  guide={pf.prevAvg != null && period.prev ? { value: Math.round(pf.prevAvg * 10) / 10, label: `เฉลี่ยต่อ${unitName}ของ${period.prev.name} ${one(pf.prevAvg)} รอบ` } : undefined}
                />
                <div class="tiny">แตะแท่งเพื่อดูเวลาโฟกัสและรอบที่หยุดก่อนครบ</div>
              </Glass>

              <Glass class="pad stack-sm">
                <div class="h3">คุณภาพการโฟกัส · {period.title}</div>
                <div class="list">
                  <Row k="ทำครบรอบ" v={pct(q.rate)} sub={`จาก ${q.rounds} รอบที่เริ่ม (ไม่นับรอบที่สั้นกว่า 1 นาที)`} />
                  <Row k="หยุดชั่วคราวต่อรอบ" v={`${one(q.pausesPerRound)} ครั้ง`} sub={`เฉลี่ย ${one(q.pausedMinPerRound)} นาทีต่อรอบ`} />
                  <Row k="รอบที่ไม่หยุดเลย" v={pct(q.noPauseShare)} />
                  <Row k="พักครบเวลา" v={pct(q.restsFullShare)} sub="ไม่ข้ามพักและไม่จบพักก่อน" />
                  <Row k="กลับมาเริ่มรอบถัดไปหลังพักจบ" v={q.backMedianMin == null ? '–' : `${one(q.backMedianMin)} นาที`} sub="ค่ากลาง (มัธยฐาน) ของวันเดียวกัน" />
                  <Row k="เวลาโฟกัสต่อวันที่ได้ทำ" v={q.focusMinPerActiveDay == null ? '–' : fmtDuration(q.focusMinPerActiveDay)} />
                </div>
              </Glass>

              {period.kind !== 'day' && (
                <Glass class="pad stack-sm">
                  <div class="h3">ช่วงเวลาที่ทำครบ · {period.title}</div>
                  <div class="tiny">รอบที่ครบ แยกตามชั่วโมงที่เริ่ม</div>
                  <BarChart data={hours.map((h) => ({ key: String(h), label: `${pad(h)}:00–${pad((h + 1) % 24)}:00`, tick: pad(h), value: pf.byHour[h] }))} unit="รอบ" title="รอบที่ครบ แยกตามชั่วโมงที่เริ่ม" tone="var(--accent)" every={6} />
                  {pf.curDays >= 14 && (
                    <>
                      <div class="tiny">รอบที่ครบเฉลี่ยต่อวัน แยกตามวันในสัปดาห์</div>
                      <BarChart data={pf.byWeekday.map((d) => ({ key: d.label, label: d.label, value: Math.round(d.avg * 10) / 10 }))} unit="รอบ/วัน" title="เฉลี่ยรอบที่ครบต่อวัน แยกตามวันในสัปดาห์" tone="var(--accent)" every={1} />
                    </>
                  )}
                </Glass>
              )}

              {pf.heat.length > 0 && (
                <Glass class="pad stack-sm">
                  <div class="h3">นาทีโฟกัสแต่ละวัน · {period.title}</div>
                  <HeatMap data={pf.heat} unit="นาที" title="นาทีโฟกัสแต่ละวัน" tone="var(--accent)" />
                  <div class="tiny">ยิ่งเข้มยิ่งโฟกัสนาน แตะช่องเพื่อดูตัวเลข</div>
                </Glass>
              )}

              {(pf.byArea.length > 0 || pf.byTask.length > 0) && (
                <Glass class="pad stack-sm">
                  <div class="h3">ทำอะไรไปบ้าง · {period.title}</div>
                  <div class="list">
                    {pf.byArea.map((a) => <Row key={a.label} k={a.label} v={fmtDuration(a.focusSec / 60)} sub={`ครบ ${a.done} รอบ`} />)}
                  </div>
                  {pf.byTask.length > 0 && <div class="tiny">งานที่ใช้เวลามากที่สุด</div>}
                  <div class="list">
                    {pf.byTask.map((t) => <Row key={t.label} k={t.label} v={fmtDuration(t.focusSec / 60)} sub={`ครบ ${t.done} · หยุดก่อนครบ ${t.stopped}`} />)}
                  </div>
                </Glass>
              )}

              {period.kind !== 'day' && <PeriodRecords pf={pf} title={period.title} />}
              <Log key={`${period.from}:${period.to}`} rows={pf.rows} tasks={s.tasks} />
            </>
          )}

          <button class="btn block" onClick={exportCsv}>{I.download({ size: 18 })} ดาวน์โหลดทุกรอบเป็นไฟล์ตาราง (CSV)</button>
          <div class="tiny">
            นิยาม: รอบครบ = นับเวลาจนหมดตามแผน · หยุดก่อนครบ = กดจบเองหรือกดพักเลย (รอบโฟกัสที่สั้นกว่า 1 นาทีไม่บันทึก) · ครบติดกัน = รอบถัดไปเริ่มภายใน {f.rest + 5} นาทีหลังรอบก่อนจบ · เวลาที่นับไม่รวมช่วงหยุดชั่วคราว · ช่วงที่ยังไม่จบเทียบกับช่วงก่อนหน้าถึงเวลาเดียวกัน · วันก่อนเริ่มใช้แอปไม่นับ
          </div>
        </>
      )}
    </div>
  );
}
