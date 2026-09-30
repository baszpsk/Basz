// Pomodoro 25/5: the timer sheet, the bar that follows him across tabs while
// a round runs, and the statistics page. Every round is recorded in full
// (start, end, planned vs counted time, pauses, how it ended, the task).

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { BarChart, HeatMap } from '../components/charts';
import { I } from '../components/icons';
import { burstFrom, Empty, Glass, PageHead, Ring, Sheet, toast } from '../components/ui';
import { saveMeta } from '../lib/actions';
import { cap } from '../lib/claude';
import { focusCsv, focusReport, isFull, secOf, type FocusReport, type Round } from '../lib/focusstats';
import { useNow, useStore } from '../lib/hooks';
import type { Nav } from '../lib/nav';
import * as P from '../lib/pomodoro';
import { AREA_LABEL, rankTasks } from '../lib/priority';
import { sound } from '../lib/sound';
import { store } from '../lib/store';
import { fmtClock, fmtShortDate, pad, todayKey } from '../lib/time';
import type { Pomo, Task } from '../lib/types';

const hm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const mins = (sec: number) => Math.round(sec / 60);
const pct = (x?: number) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const one = (x?: number) => (x == null ? '–' : x.toFixed(1));

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
  const [confirmStop, setConfirmStop] = useState(false);
  const [picking, setPicking] = useState(false);
  const p = { ...P.IDLE, ...(s.meta.pomo || {}) };
  const f = s.settings.focus;
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const minute = Math.floor(now.getTime() / 60000);
  const rep = useMemo(() => focusReport(s.logs, s.tasks, R, f.rest, today, now), [s.logs, s.tasks, today, minute]);
  const ranked = useMemo(() => rankTasks(Object.values(s.tasks), now.getTime(), today, R).slice(0, 4), [s.tasks, today, minute]);
  useEffect(() => {
    if (!confirmStop) return;
    const t = window.setTimeout(() => setConfirmStop(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmStop]);

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
    if (p.phase === 'work' && !confirmStop) return setConfirmStop(true);
    setConfirmStop(false);
    const wasWork = p.phase === 'work';
    const kept = P.stop();
    toast(wasWork ? (kept ? 'บันทึกรอบนี้แล้ว (หยุดก่อนครบ)' : 'ไม่บันทึก เพราะสั้นกว่า 1 นาที') : 'จบพักแล้ว');
  };

  return (
    <Sheet open={props.open} onClose={props.onClose} title={`ปอมโมโดโร ${f.work}/${f.rest}`}>
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
            <button class="btn primary" id="pomo-start" onClick={(e) => start(e as unknown as Event)}>{I.play({ size: 18 })} เริ่มโฟกัส {f.work} นาที</button>
          )}
          {p.phase === 'work' && (p.running ? (
            <button class="btn" id="pomo-pause" onClick={() => P.pause()}>{I.pause({ size: 18 })} หยุดชั่วคราว</button>
          ) : (
            <button class="btn primary" id="pomo-resume" onClick={() => P.resume()}>{I.play({ size: 18 })} ทำต่อ</button>
          ))}
          {p.phase === 'break' && (
            <button class="btn primary" id="pomo-skip" onClick={(e) => start(e as unknown as Event)}>{I.skip({ size: 18 })} ข้ามพัก เริ่มรอบต่อไป</button>
          )}
          {p.phase !== 'idle' && (
            <button class={`btn ${confirmStop ? 'danger' : ''}`} id="pomo-stop" onClick={stop}>{I.stop({ size: 18 })} {p.phase === 'break' ? 'จบพัก' : confirmStop ? 'แตะอีกครั้งเพื่อจบก่อนครบ' : 'จบรอบนี้'}</button>
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

function versus(a: number, b: number, unit: string) {
  const d = a - b;
  if (d === 0) return `เท่ากับ 7 วันก่อนหน้า`;
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} ${unit} จาก 7 วันก่อนหน้า`;
}

function Records(props: { rep: FocusReport }) {
  const t = props.rep.total;
  return (
    <Glass class="pad stack-sm">
      <div class="h3">สถิติตลอดกาล</div>
      <div class="list">
        <Row k="รอบที่ครบทั้งหมด" v={`${t.done} รอบ`} sub={t.first ? `ตั้งแต่ ${fmtShortDate(t.first)} · หยุดก่อนครบ ${t.stopped} รอบ` : undefined} />
        <Row k="เวลาโฟกัสรวม" v={`${(t.focusSec / 3600).toFixed(1)} ชม.`} />
        <Row k="วันที่ทำครบอย่างน้อย 1 รอบ" v={`${t.activeDays} วัน`} />
        <Row k="ทำติดกันตอนนี้" v={`${t.streak} วัน`} sub={`ติดกันนานที่สุด ${t.longestStreak} วัน`} />
        <Row k="วันที่ทำได้มากที่สุด" v={t.best ? `${t.best.done} รอบ` : '–'} sub={t.best ? fmtShortDate(t.best.key) : undefined} />
        <Row k="ครบติดกันมากที่สุดในวันเดียว" v={`${t.longestChain.n} รอบ`} sub={t.longestChain.key ? fmtShortDate(t.longestChain.key) : undefined} />
      </div>
    </Glass>
  );
}

function Log(props: { rows: Round[]; tasks: Record<string, Task> }) {
  const recent = props.rows.slice(-40).reverse();
  return (
    <Glass class="pad stack-sm">
      <div class="h3">บันทึกทุกรอบ (40 รอบล่าสุด)</div>
      <div class="list">
        {recent.map((r) => {
          const ended = r.endedBy === 'skip' ? 'ข้ามพัก' : isFull(r) ? 'ครบ' : 'หยุดก่อนครบ';
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
    </Glass>
  );
}

export function FocusPage(props: { back: () => void; nav: Nav }) {
  const s = useStore();
  const now = useNow(30000);
  const f = s.settings.focus;
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const rep = useMemo(() => focusReport(s.logs, s.tasks, R, f.rest, today, now), [s.logs, s.tasks, today, Math.floor(now.getTime() / 60000)]);
  const p = { ...P.IDLE, ...(s.meta.pomo || {}) };
  const q = rep.quality;
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
      <PageHead title={`โฟกัส ${f.work}/${f.rest}`} eyebrow="ปอมโมโดโร · สถิติทุกรอบ" onBack={props.back} />
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
        </div>
        <button class="btn primary block" style={{ marginTop: '12px' }} onClick={() => props.nav.focus()}>
          {p.phase === 'idle' ? <>{I.play({ size: 18 })} เริ่มโฟกัส {f.work} นาที</> : <>{I.clock({ size: 18 })} เปิดตัวจับเวลา · {phaseLabel(p)}</>}
        </button>
      </Glass>

      {rep.rows.length === 0 ? (
        <Glass><Empty title="ยังไม่มีรอบที่บันทึก" body={`กดเริ่มโฟกัส ${f.work} นาที แล้วสถิติทุกอย่างจะขึ้นที่นี่เอง`} /></Glass>
      ) : (
        <>
          <Glass class="pad stack-sm">
            <div class="h3">7 วันล่าสุด</div>
            <div class="list">
              <Row k="รอบที่ครบ" v={`${rep.last7.done} รอบ`} sub={versus(rep.last7.done, rep.prev7.done, 'รอบ')} />
              <Row k="เวลาโฟกัส" v={`${mins(rep.last7.focusSec)} นาที`} sub={versus(mins(rep.last7.focusSec), mins(rep.prev7.focusSec), 'นาที')} />
              <Row k="ทำครบรอบ" v={pct(rep.last7.rate)} sub={`7 วันก่อนหน้า ${pct(rep.prev7.rate)}`} />
              <Row k="วันที่ได้ทำ" v={`${rep.last7.activeDays}/7 วัน`} sub={`7 วันก่อนหน้า ${rep.prev7.activeDays}/7 วัน`} />
            </div>
          </Glass>

          <Glass class="pad stack-sm">
            <div class="h3">14 วันล่าสุด</div>
            <BarChart data={rep.daily.map((d) => ({ key: d.key, label: fmtShortDate(d.key), value: d.done }))} unit="รอบ" title="รอบที่ครบแต่ละวัน" tone="var(--accent)" labelLast />
          </Glass>

          <Glass class="pad stack-sm">
            <div class="h3">คุณภาพการโฟกัส · 30 วัน</div>
            <div class="list">
              <Row k="ทำครบรอบ" v={pct(q.rate)} sub={`จาก ${q.rounds} รอบที่เริ่ม (ไม่นับรอบที่สั้นกว่า 1 นาที)`} />
              <Row k="หยุดชั่วคราวต่อรอบ" v={`${one(q.pausesPerRound)} ครั้ง`} sub={`เฉลี่ย ${one(q.pausedMinPerRound)} นาทีต่อรอบ`} />
              <Row k="รอบที่ไม่หยุดเลย" v={pct(q.noPauseShare)} />
              <Row k="พักครบเวลา" v={pct(q.restsFullShare)} sub="ไม่ข้ามพักและไม่จบพักก่อน" />
              <Row k="กลับมาเริ่มรอบถัดไปหลังพักจบ" v={q.backMedianMin == null ? '–' : `${one(q.backMedianMin)} นาที`} sub="ค่ากลาง (มัธยฐาน) ของวันเดียวกัน" />
              <Row k="เวลาโฟกัสต่อวันที่ได้ทำ" v={q.focusMinPerActiveDay == null ? '–' : `${Math.round(q.focusMinPerActiveDay)} นาที`} />
            </div>
          </Glass>

          <Glass class="pad stack-sm">
            <div class="h3">ช่วงเวลาที่ทำครบ</div>
            <BarChart data={rep.byHour.map((v, h) => ({ key: String(h), label: `${pad(h)}:00`, value: v }))} unit="รอบ" title="รอบที่ครบ แยกตามชั่วโมงที่เริ่ม" tone="var(--accent)" />
            <BarChart data={rep.byWeekday.map((d) => ({ key: d.label, label: d.label, value: Math.round(d.avg * 10) / 10 }))} unit="รอบ/วัน" title="เฉลี่ยรอบที่ครบต่อวัน แยกตามวันในสัปดาห์" tone="var(--a-growth)" />
          </Glass>

          <Glass class="pad stack-sm">
            <div class="h3">12 สัปดาห์</div>
            <HeatMap data={rep.heat} unit="นาที" title="นาทีโฟกัสแต่ละวัน" tone="var(--accent)" />
          </Glass>

          {(rep.byArea.length > 0 || rep.byTask.length > 0) && (
            <Glass class="pad stack-sm">
              <div class="h3">ทำอะไรไปบ้าง · 30 วัน</div>
              <div class="list">
                {rep.byArea.map((a) => <Row key={a.label} k={a.label} v={`${mins(a.focusSec)} นาที`} sub={`ครบ ${a.done} รอบ`} />)}
              </div>
              {rep.byTask.length > 0 && <div class="tiny">งานที่ใช้เวลามากที่สุด</div>}
              <div class="list">
                {rep.byTask.map((t) => <Row key={t.label} k={t.label} v={`${mins(t.focusSec)} นาที`} sub={`ครบ ${t.done} · หยุดก่อนครบ ${t.stopped}`} />)}
              </div>
            </Glass>
          )}

          <Records rep={rep} />
          <Log rows={rep.rows} tasks={s.tasks} />

          <button class="btn block" onClick={exportCsv}>{I.download({ size: 18 })} ดาวน์โหลดทุกรอบเป็นไฟล์ตาราง (CSV)</button>
          <div class="tiny">
            นิยาม: รอบครบ = นับเวลาจนหมดตามแผน · หยุดก่อนครบ = กดจบเอง (รอบโฟกัสที่สั้นกว่า 1 นาทีไม่บันทึก) · ครบติดกัน = รอบถัดไปเริ่มภายใน {f.rest + 5} นาทีหลังรอบก่อนจบ · เวลาที่นับไม่รวมช่วงหยุดชั่วคราว
          </div>
        </>
      )}
    </div>
  );
}
