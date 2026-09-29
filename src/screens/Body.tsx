import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BarChart, HeatMap, LineChart } from '../components/charts';
import { I } from '../components/icons';
import { burst, burstFrom, Check, Empty, Glass, Pill, Ring, Seg, Sheet, Stepper, toast } from '../components/ui';
import { BREATH_PRESETS, EXERCISES, PROGRAMS, WARMUP, programForDay, resolveExercise, type Exercise, type Program } from '../content/exercises';
import { logBreath, logWorkout, saveMeta, setCheck } from '../lib/actions';
import { useNow, useStore } from '../lib/hooks';
import type { Nav } from '../lib/nav';
import { medMinutes } from '../lib/schedule';
import { sound } from '../lib/sound';
import { addDays, fmtClock, fmtHM, fmtShortDate, monthOf, todayKey, weekday, wdName } from '../lib/time';
import type { SetLog } from '../lib/types';
import { computeStats } from '../lib/stats';

// ---------------- Workout player ----------------
type Phase = 'warmup' | 'set' | 'rest' | 'summary';

function levelOf(levels: Record<string, number> | undefined, ex: Exercise) {
  const v = levels?.[ex.id];
  return Math.max(0, Math.min(ex.levels.length - 1, v ?? ex.start));
}

export function WorkoutSheet(props: { programId: string | null; onClose: () => void }) {
  const s = useStore();
  const program = PROGRAMS.find((p) => p.id === props.programId) || null;
  const hasBand = !!s.meta.hasBand;
  const [phase, setPhase] = useState<Phase>('warmup');
  const [ei, setEi] = useState(0);
  const [si, setSi] = useState(0);
  const [reps, setReps] = useState(10);
  const [log, setLog] = useState<Record<string, SetLog[]>>({});
  const [restEnd, setRestEnd] = useState(0);
  const [holdEnd, setHoldEnd] = useState(0);
  const [started] = useState(Date.now());
  const [rpe, setRpe] = useState(0);
  const [showCues, setShowCues] = useState(true);
  const [levelUps, setLevelUps] = useState<string[]>([]);
  const [, tick] = useState(0);
  const ended = useRef(false);

  useEffect(() => {
    if (!props.programId) return;
    setPhase('warmup');
    setEi(0);
    setSi(0);
    setLog({});
    setLevelUps([]);
    setRpe(0);
    ended.current = false;
  }, [props.programId]);

  useEffect(() => {
    if (phase !== 'rest' && !holdEnd) return;
    const id = window.setInterval(() => tick((x) => x + 1), 250);
    return () => window.clearInterval(id);
  }, [phase, holdEnd]);

  useEffect(() => {
    if (phase === 'rest' && restEnd && restEnd <= Date.now()) {
      setRestEnd(0);
      sound.chime();
      setPhase('set');
    }
    if (holdEnd && holdEnd <= Date.now()) {
      setHoldEnd(0);
      sound.done();
    }
  });

  if (!program) return <Sheet open={false} onClose={props.onClose} />;
  const item = program.items[ei];
  const ex = item ? resolveExercise(item.ex, hasBand) : null;
  const lvl = ex ? levelOf(s.meta.levels, ex) : 0;
  const restLeft = Math.max(0, (restEnd - Date.now()) / 1000);
  const holdLeft = Math.max(0, (holdEnd - Date.now()) / 1000);


  const lastReps = (exId: string) => {
    const all = Object.values(s.logs).flatMap((m) => Object.values(m.workouts || {})).sort((a, b) => b.start - a.start);
    for (const w of all) {
      const sets = w.exercises[exId];
      if (sets?.length) return sets[0].reps || sets[0].seconds || 0;
    }
    return 0;
  };

  const beginExercise = (i: number) => {
    const it = program.items[i];
    if (!it) {
      setPhase('summary');
      return;
    }
    const e = resolveExercise(it.ex, hasBand);
    setEi(i);
    setSi(0);
    const prev = lastReps(e.id);
    setReps(prev ? Math.min(it.max, Math.max(it.min, prev)) : it.min);
    setPhase('set');
  };

  const logSet = (e: Event) => {
    if (!ex || !item) return;
    const entry: SetLog = ex.mode === 'hold' ? { seconds: reps, level: lvl } : { reps, level: lvl };
    const sets = [...(log[ex.id] || []), entry];
    const next = { ...log, [ex.id]: sets };
    setLog(next);
    sound.tick();
    burstFrom(e, `Set ${si + 1} ✓`, 'var(--a-health)');
    if (si + 1 < item.sets) {
      setSi(si + 1);
      setRestEnd(Date.now() + item.rest * 1000);
      setPhase('rest');
    } else {
      if (sets.length >= item.sets && sets.every((x) => (x.reps ?? x.seconds ?? 0) >= item.max) && lvl < ex.levels.length - 1) setLevelUps((l) => [...l, ex.id]);
      beginExercise(ei + 1);
    }
  };

  const finish = (e: Event) => {
    if (ended.current) return;
    ended.current = true;
    logWorkout({ start: started, end: Date.now(), program: program.id, exercises: log, rpe: rpe || undefined });
    if (levelUps.length) {
      const levels = { ...(s.meta.levels || {}) };
      for (const id of levelUps) levels[id] = levelOf(s.meta.levels, EXERCISES[id]) + 1;
      saveMeta({ levels });
    }
    sound.done();
    burstFrom(e, 'Saved', 'var(--a-health)');
    toast('Workout saved');
    props.onClose();
  };

  const minutes = Math.round((Date.now() - started) / 60000);
  const totalSets = Object.values(log).reduce((a, x) => a + x.length, 0);
  const totalReps = Object.values(log).reduce((a, x) => a + x.reduce((b, y) => b + (y.reps || 0), 0), 0);

  return (
    <Sheet open={!!props.programId} onClose={props.onClose} title={`${program.name}`}>
      <div class="stack">
        <div class="row between">
          <Pill tone="var(--a-health)">{phase === 'warmup' ? 'Warm-up' : phase === 'summary' ? 'Summary' : `${ei + 1} / ${program.items.length}`}</Pill>
          <span class="tiny num">{minutes} min</span>
        </div>

        {phase === 'warmup' && (
          <>
            <div class="sub">วอร์มอัพ 4–5 นาที ไม่ต้องยืดค้างนาน ทำตามลำดับ</div>
            <div class="card list">
              {WARMUP.map((w) => (
                <div key={w.name} class="item">
                  <span class="tiny num" style={{ width: '38px' }}>{w.sec}s</span>
                  <div class="grow"><div class="t">{w.name}</div><div class="d">{w.th}</div></div>
                </div>
              ))}
            </div>
            <div class="banner">ออกกำลังกายเมื่อห่างมื้อใหญ่อย่างน้อย 2–3 ชม. ถ้ามีอาการแสบอกระหว่างทำ ให้ข้ามท่าที่ศีรษะต่ำ</div>
            <button class="btn primary block" onClick={() => beginExercise(0)}>Warm-up done · start</button>
          </>
        )}

        {(phase === 'set' || phase === 'rest') && ex && item && (
          <>
            <div>
              <div class="eyebrow">{ex.levels[lvl].name}</div>
              <h3 class="h1" style={{ fontSize: '24px' }}>{ex.name}</h3>
              <div class="sub">{ex.th} · {ex.levels[lvl].th}</div>
            </div>
            <div class="row wrap" style={{ gap: '6px' }}>
              <Pill>{item.sets} sets</Pill>
              <Pill>{item.min}–{item.max} {ex.mode === 'hold' ? 's' : 'reps'}{ex.perSide ? ' / side' : ''}</Pill>
              <Pill>rest {item.rest}s</Pill>
              {lastReps(ex.id) > 0 && <Pill tone="var(--a-trading)">last {lastReps(ex.id)}</Pill>}
            </div>
            <button class="chip" onClick={() => setShowCues(!showCues)}>{showCues ? 'Hide form cues' : 'Show form cues'}</button>
            {showCues && (
              <div class="card pad guide">
                <ul>{ex.cues.map((c) => <li key={c}>{c}</li>)}</ul>
                {ex.safety && <div class="tiny" style={{ marginTop: '8px' }}>⚠ {ex.safety}</div>}
                {ex.reflux && <div class="tiny" style={{ marginTop: '6px', color: 'var(--warn)' }}>Reflux: {ex.reflux}</div>}
              </div>
            )}
            {phase === 'rest' ? (
              <div class="stack center">
                <div class="eyebrow">Rest · next is set {si + 1} of {item.sets}</div>
                <div class="display-num" style={{ fontSize: '56px' }}>{fmtClock(restLeft)}</div>
                <div class="row" style={{ justifyContent: 'center', gap: '8px' }}>
                  <button class="btn" onClick={() => setRestEnd(restEnd + 15000)}>+15 s</button>
                  <button class="btn primary" onClick={() => { setRestEnd(0); setPhase('set'); }}>Skip rest</button>
                </div>
              </div>
            ) : (
              <div class="stack center" style={{ alignItems: 'center' }}>
                <div class="eyebrow">Set {si + 1} of {item.sets}</div>
                {ex.mode === 'hold' && (
                  <div class="stack-sm" style={{ alignItems: 'center' }}>
                    <div class="display-num" style={{ fontSize: '48px' }}>{holdEnd ? fmtClock(holdLeft) : `${reps}s`}</div>
                    {!holdEnd && <button class="btn" onClick={() => setHoldEnd(Date.now() + reps * 1000)}>{I.play({ size: 16 })} Start {reps}s hold</button>}
                  </div>
                )}
                <Stepper label={ex.mode === 'hold' ? 'seconds' : 'reps'} unit={ex.mode === 'hold' ? 's' : 'reps'} value={reps} onChange={setReps} min={0} max={200} step={ex.mode === 'hold' ? 5 : 1} />
                <div class="tiny">ทำจนเหลือแรงอีก 1–2 ครั้ง แล้วใส่จำนวนที่ทำได้จริง</div>
                <button class="btn primary block" onClick={logSet}>Log set</button>
              </div>
            )}
            <div class="row between">
              <button class="btn small ghost" onClick={() => beginExercise(ei + 1)}>Skip exercise</button>
              <button class="btn small ghost" onClick={() => setPhase('summary')}>End workout</button>
            </div>
          </>
        )}

        {phase === 'summary' && (
          <>
            <div class="tiles">
              <div class="tile"><div class="k">TIME</div><div class="v">{minutes}<span class="tiny"> min</span></div></div>
              <div class="tile"><div class="k">SETS</div><div class="v">{totalSets}</div></div>
              <div class="tile"><div class="k">REPS</div><div class="v">{totalReps}</div></div>
            </div>
            {levelUps.length > 0 && (
              <div class="card pad">
                <div class="h3">Level up next time</div>
                <div class="sub">ทำครบเป้าทุกเซ็ตแล้ว ครั้งหน้าจะขยับท่าให้ยากขึ้น 1 ระดับ:</div>
                <ul>{levelUps.map((id) => <li key={id}>{EXERCISES[id].name} → {EXERCISES[id].levels[levelOf(s.meta.levels, EXERCISES[id]) + 1]?.name}</li>)}</ul>
              </div>
            )}
            <div class="field">
              <label>How hard was it?</label>
              <div class="row wrap" style={{ gap: '6px' }}>
                {[['Easy', 6], ['Solid', 8], ['Brutal', 10]].map(([l, v]) => (
                  <button key={l} class={`chip ${rpe === v ? 'on' : ''}`} onClick={() => setRpe(v as number)}>{l}</button>
                ))}
              </div>
            </div>
            <button class="btn primary block" disabled={totalSets === 0} onClick={finish}>Save workout</button>
            {totalSets === 0 && <div class="tiny center">ยังไม่มีเซ็ตที่บันทึก</div>}
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- Breathing ----------------
export function BreathSheet(props: { presetId: string | null; onClose: () => void }) {
  const preset = BREATH_PRESETS.find((p) => p.id === props.presetId) || null;
  const [running, setRunning] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [phaseIn, setPhaseIn] = useState(true);
  const [, tick] = useState(0);
  const [cues, setCues] = useState(false);
  const logged = useRef(false);
  const today = todayKey(new Date(), 6);

  useEffect(() => {
    setRunning(false);
    setStartAt(0);
    logged.current = false;
  }, [props.presetId]);

  useEffect(() => {
    if (!running || !preset) return;
    let inhale = true;
    setPhaseIn(true);
    if (cues) sound.breathIn();
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        inhale = !inhale;
        setPhaseIn(inhale);
        if (cues) (inhale ? sound.breathIn : sound.breathOut)();
        loop();
      }, (inhale ? preset.inhale : preset.exhale) * 1000);
    };
    loop();
    const tk = window.setInterval(() => tick((x) => x + 1), 500);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(tk);
    };
  }, [running, preset?.id, cues]);

  useEffect(() => {
    if (!preset || !running || logged.current) return;
    if ((Date.now() - startAt) / 1000 >= preset.minutes * 60) {
      sound.chime();
      saveRef.current?.();
    }
  });
  const saveRef = useRef<(() => void) | null>(null);

  if (!preset) return <Sheet open={false} onClose={props.onClose} />;
  const total = preset.minutes * 60;
  const elapsed = running ? (Date.now() - startAt) / 1000 : 0;
  const left = Math.max(0, total - elapsed);

  const save = (e?: Event) => {
    if (logged.current) return;
    const mins = Math.round(elapsed / 60);
    if (mins >= 1) {
      logged.current = true;
      logBreath({ start: startAt, minutes: mins, preset: preset.id });
      const itemId = preset.id === 'sleep' ? 'breath-night' : new Date().getHours() < 15 ? 'breath-am' : 'breath-pm';
      if (mins >= preset.minutes - 1 && preset.id !== 'sos') setCheck(today, itemId, true);
      if (e) burstFrom(e, `${mins} min`, 'var(--a-home)');
      else burst(window.innerWidth / 2, window.innerHeight / 2, `${mins} min`, 'var(--a-home)');
      toast(`Breathing ${mins} min saved`);
    }
    setRunning(false);
  };
  saveRef.current = () => save();

  return (
    <Sheet open={!!props.presetId} onClose={() => { if (running) save(); props.onClose(); }} title={preset.name}>
      <div class="stack center" style={{ alignItems: 'center' }}>
        <div class="sub">{preset.th}</div>
        <div
          class="orb"
          style={{
            '--tone': 'var(--a-home)',
            transform: running ? `scale(${phaseIn ? 1 : 0.62})` : 'scale(0.7)',
            transition: `transform ${phaseIn ? preset.inhale : preset.exhale}s ease-in-out`,
          } as JSX.CSSProperties}
        />
        <div class="h2">{running ? (phaseIn ? 'หายใจเข้า · ท้องป่อง อกนิ่ง' : preset.openMouth ? 'หายใจออกช้าๆ · เปิดปากเล็กน้อย' : 'หายใจออกช้าๆ') : 'พร้อมแล้วกดเริ่ม'}</div>
        <div class="display-num" style={{ fontSize: '40px' }}>{fmtClock(running ? left : total)}</div>
        <div class="row" style={{ gap: '8px' }}>
          {!running ? (
            <button class="btn primary" onClick={() => { sound.unlock(); setStartAt(Date.now()); logged.current = false; setRunning(true); }}>{I.play({ size: 18 })} Start</button>
          ) : (
            <button class="btn" onClick={(e) => save(e as unknown as Event)}>{I.stop({ size: 18 })} Finish</button>
          )}
          <button class={`chip ${cues ? 'on' : ''}`} onClick={() => { sound.unlock(); setCues(!cues); }}>Sound cues</button>
        </div>
        <div class="tiny">เข้า {preset.inhale} วิ · ออก {preset.exhale} วิ · ประมาณ {Math.round(60 / (preset.inhale + preset.exhale))} ครั้ง/นาที</div>
      </div>
    </Sheet>
  );
}

// ---------------- Screen ----------------
export function BodyScreen(props: { nav: Nav }) {
  const s = useStore();
  const now = useNow(60000);
  const [view, setView] = useState<'train' | 'breathe' | 'health'>('train');
  const [exInfo, setExInfo] = useState<Exercise | null>(null);
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const stats = useMemo(() => computeStats(s.logs, s.tasks, s.plan, today, R), [s.logs, s.tasks, s.plan, today]);
  const wd = weekday(today);
  const todays = programForDay(wd, s.settings.workoutDays);
  let nextProgram: Program | null = todays;
  let nextDay = today;
  for (let i = 1; !nextProgram && i < 8; i++) {
    nextDay = addDays(today, i);
    nextProgram = programForDay(weekday(nextDay), s.settings.workoutDays);
  }
  const checks = s.logs[monthOf(today)]?.days?.[today]?.checks || {};
  const hasBand = !!s.meta.hasBand;
  const meds = (s.plan?.meds || []).filter((m) => !m.days || m.days.includes(wd)).sort((a, b) => medMinutes(a, s.settings) - medMinutes(b, s.settings));
  const sym = stats.symptoms;
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const symMap = new Map(sym.map((x) => [x.key, x]));

  return (
    <div class="screen">
      <div class="topbar">
        <div class="grow">
          <div class="eyebrow">Train · Breathe · Health</div>
          <h1 class="h1">Body</h1>
        </div>
      </div>
      <Seg id="body-view" options={[{ id: 'train', label: 'Train' }, { id: 'breathe', label: 'Breathe' }, { id: 'health', label: 'Health' }]} value={view} onChange={setView} />

      {view === 'train' && (
        <>
          <Glass class="hero" tone="var(--a-health)">
            <div class="glow" />
            <div class="eyebrow">{todays ? `Today · ${s.settings.workoutTime}` : `Next · ${wdName(weekday(nextDay))} ${fmtShortDate(nextDay)}`}</div>
            <h2 class="h1" style={{ margin: '6px 0 2px' }}>{nextProgram?.name || 'Rest day'}</h2>
            <div class="sub">{nextProgram?.focus} · ~45 min · เสื่อผืนเดียว</div>
            <div class="list" style={{ margin: '10px 0' }}>
              {nextProgram?.items.map((it) => {
                const ex = resolveExercise(it.ex, hasBand);
                const lvl = levelOf(s.meta.levels, ex);
                return (
                  <button key={it.ex} class="item" onClick={() => setExInfo(ex)}>
                    <div class="grow">
                      <div class="t">{ex.name}</div>
                      <div class="d">{ex.levels[lvl].name} · {it.sets}×{it.min}–{it.max}{ex.mode === 'hold' ? 's' : ''}{ex.perSide ? '/side' : ''}</div>
                    </div>
                    <span class="tiny">Lv {lvl + 1}</span>
                  </button>
                );
              })}
            </div>
            <button class="btn primary block" onClick={() => props.nav.workout(nextProgram?.id || 'A')}>{I.play({ size: 18 })} Start {nextProgram?.name}</button>
          </Glass>
          <div class="tiles">
            <div class="tile"><div class="k">THIS WEEK</div><div class="v">{stats.workouts.thisWeek}<span class="tiny">/3</span></div></div>
            <div class="tile"><div class="k">WEEK STREAK</div><div class="v">{stats.workouts.weekStreak}</div></div>
            <div class="tile"><div class="k">PUSH-UP PR</div><div class="v">{stats.workouts.pushupBest || '–'}</div></div>
          </div>
          <Glass class="pad stack-sm">
            <div class="h3">Pull exercises</div>
            <div class="sub">ท่าดึงกล้ามหลังที่ปลอดภัยที่สุดแบบไม่ต้องเจาะผนังคือยางยืด + door anchor ไม่มีความเสี่ยงตกแบบบาร์โหน ระหว่างยังไม่มีใช้ท่า Prone Y-T-W แทน</div>
            <button class={`chip ${hasBand ? 'on' : ''}`} onClick={() => saveMeta({ hasBand: !hasBand })}>{hasBand ? 'I have a band ✓' : 'I have a resistance band'}</button>
          </Glass>
          <Glass class="pad stack-sm">
            <div class="h3">12-week training map</div>
            <HeatMap data={stats.workouts.days} unit="workouts" title="Workouts per day, last 12 weeks" tone="var(--a-health)" />
          </Glass>
          <div class="section-head"><h2 class="h2">Exercise library</h2></div>
          <Glass class="list">
            {Object.values(EXERCISES).map((ex) => (
              <button key={ex.id} class="item" onClick={() => setExInfo(ex)}>
                <div class="grow"><div class="t">{ex.name}</div><div class="d">{ex.th}</div></div>
                <span style={{ color: 'var(--ink-3)' }}>{I.arrow({ size: 18 })}</span>
              </button>
            ))}
          </Glass>
        </>
      )}

      {view === 'breathe' && (
        <>
          <Glass class="pad stack">
            <div class="row between">
              <div>
                <div class="eyebrow">Today</div>
                <div class="display-num" style={{ fontSize: '30px' }}>{stats.breath.todayMin}<span class="tiny"> / {s.settings.breathTargetMin} min</span></div>
              </div>
              <Ring value={stats.breath.todayMin / s.settings.breathTargetMin} size={64} tone="var(--a-home)" label="Breathing goal">
                <span class="tiny num">{Math.round((stats.breath.todayMin / s.settings.breathTargetMin) * 100)}%</span>
              </Ring>
            </div>
            <div class="sub">หายใจท้องวันละ ~30 นาที (เช่น 3 × 10) และหลังมื้อหลัก ช่วยลดการเรอและอาการไหลย้อนหลังอาหาร</div>
          </Glass>
          <div class="grid2">
            {BREATH_PRESETS.map((p) => (
              <button key={p.id} class="glass hubtile" style={{ '--tone': 'var(--a-home)' } as JSX.CSSProperties} onClick={() => props.nav.breath(p.id)}>
                <span class="ic">{I.wave({ size: 20 })}</span>
                <div><div class="h3">{p.name}</div><div class="tiny">{p.minutes} min · {p.inhale}/{p.exhale}s</div></div>
              </button>
            ))}
          </div>
          <Glass class="pad stack-sm">
            <div class="h3">Last 14 days</div>
            <BarChart data={stats.breath.days.map((p) => ({ key: p.key, label: fmtShortDate(p.key), value: Math.round(p.value) }))} unit="min" title="Breathing minutes per day" tone="var(--a-home)" labelLast />
          </Glass>
        </>
      )}

      {view === 'health' && (
        <>
          <Glass class="pad stack-sm">
            <div class="row between"><div class="h3">Medicines today</div><span class="tiny">ตามที่แพทย์สั่ง</span></div>
            {meds.length ? (
              <div class="list">
                {meds.map((m) => {
                  const id = 'med-' + m.id;
                  const on = !!checks[id];
                  return (
                    <div key={m.id} class={`item ${on ? 'done' : ''}`} style={{ padding: '10px 2px' }}>
                      <Check on={on} tone="var(--a-growth)" label={m.name} onToggle={(e) => { setCheck(today, id, !on); if (!on) burstFrom(e, '', 'var(--a-growth)'); }} />
                      <div class="grow"><div class="t">{m.name}</div>{m.note && <div class="d">{m.note}</div>}</div>
                      <span class="tiny num">{fmtHM(medMinutes(m, s.settings))}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty title="No medicines set" body="แผนยายังไม่ถูกโหลด" />
            )}
            <div class="tiny">Adherence 14 days · {Math.round(stats.meds.adherence14 * 100)}% · streak {stats.meds.streak} d</div>
          </Glass>

          <Glass class="pad stack-sm">
            <div class="row between"><div class="h3">Symptoms · 30 days</div><button class="chip" onClick={props.nav.checkin}>Check-in</button></div>
            {sym.length ? (
              <LineChart
                title="Belching and heartburn scores, 0 to 10, last 30 days"
                max={10}
                series={[
                  { name: 'Belching', color: 'var(--series-1)', points: days30.map((k) => ({ key: k, value: symMap.get(k)?.belch })) },
                  { name: 'Heartburn', color: 'var(--series-2)', points: days30.map((k) => ({ key: k, value: symMap.get(k)?.heartburn })) },
                ]}
              />
            ) : (
              <Empty title="No check-ins yet" body="เช็คอินทุกคืนตอน Wind-down แล้วกราฟแนวโน้มจะขึ้นที่นี่ ใช้คุยกับหมอได้" />
            )}
          </Glass>

          <div class="tiles two">
            <div class="tile"><div class="k">LIGHTS-OUT STREAK</div><div class="v">{stats.sleep.streak}<span class="tiny"> nights</span></div></div>
            <div class="tile"><div class="k">ON TIME · 14 D</div><div class="v">{stats.sleep.last14}<span class="tiny">/14</span></div></div>
          </div>

          <div class="section-head"><h2 class="h2">Your plan</h2><span class="tiny">แหล่งอ้างอิงอยู่ท้ายแต่ละหัวข้อ</span></div>
          {(s.plan?.guides || []).length ? (
            <Glass class="list">
              {(s.plan?.guides || []).map((g) => (
                <div key={g.id}>
                  <button class="item" aria-expanded={openGuide === g.id} onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)}>
                    <div class="grow"><div class="t">{g.title}</div><div class="d">{g.summary}</div></div>
                    <span style={{ color: 'var(--ink-3)', transform: openGuide === g.id ? 'rotate(90deg)' : 'none', transition: 'transform .3s' }}>{I.arrow({ size: 18 })}</span>
                  </button>
                  {openGuide === g.id && (
                    <div class="guide" style={{ padding: '0 16px 16px' }}>
                      <ul>{g.points.map((p) => <li key={p}>{p}</li>)}</ul>
                      {g.evidence && <div class="tiny" style={{ marginTop: '10px' }}>Evidence: {g.evidence}</div>}
                      {!!g.sources?.length && (
                        <div class="src" style={{ marginTop: '6px' }}>
                          {g.sources.map((x, i) => (
                            <span key={x.url}>{i > 0 && ' · '}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a></span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </Glass>
          ) : (
            <Glass><Empty title="Plan is loading" body="แผนสุขภาพส่วนตัวจะแสดงที่นี่" /></Glass>
          )}

          {!!s.plan?.doctorQuestions?.length && (
            <>
              <div class="section-head"><h2 class="h2">Ask your doctor</h2></div>
              <Glass class="pad stack-sm">
                <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {s.plan.doctorQuestions.map((q) => <li key={q.id}><b>{q.q}</b>{q.why && <div class="tiny">{q.why}</div>}</li>)}
                </ol>
                <button
                  class="btn small"
                  onClick={() => {
                    const text = (s.plan?.doctorQuestions || []).map((q, i) => `${i + 1}. ${q.q}`).join('\n');
                    navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Select the text to copy'));
                  }}
                >
                  Copy list
                </button>
              </Glass>
            </>
          )}
        </>
      )}

      <Sheet open={!!exInfo} onClose={() => setExInfo(null)} title={exInfo?.name}>
        {exInfo && (
          <div class="stack">
            <div class="sub">{exInfo.th}</div>
            <div class="card pad guide"><ul>{exInfo.cues.map((c) => <li key={c}>{c}</li>)}</ul></div>
            {exInfo.safety && <div class="banner">{exInfo.safety}</div>}
            {exInfo.reflux && <div class="banner">Reflux: {exInfo.reflux}</div>}
            <div class="h3">Progression</div>
            <div class="card list">
              {exInfo.levels.map((l, i) => {
                const cur = levelOf(s.meta.levels, exInfo) === i;
                return (
                  <button key={l.name} class="item" onClick={() => { saveMeta({ levels: { ...(s.meta.levels || {}), [exInfo.id]: i } }); toast(`${exInfo.name}: ${l.name}`); }}>
                    <span class="tiny num" style={{ width: '28px' }}>Lv{i + 1}</span>
                    <div class="grow"><div class="t">{l.name}</div><div class="d">{l.th}</div></div>
                    {cur && <Pill tone="var(--a-health)">Current</Pill>}
                  </button>
                );
              })}
            </div>
            <div class="tiny">แตะระดับเพื่อตั้งเป็นระดับปัจจุบัน ขยับขึ้นเมื่อทำครบเป้าสูงสุดทุกเซ็ตโดยยังเหลือแรง 1–2 ครั้ง</div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
