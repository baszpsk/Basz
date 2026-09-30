import type { JSX } from 'preact';
import { useErrorBoundary, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { I } from './components/icons';
import { ToastHost } from './components/ui';
import { computeAlerts } from './lib/alerts';
import { useLocal, useStore } from './lib/hooks';
import type { HubPage, Nav, TabId } from './lib/nav';
import { paintSky } from './lib/sky';
import { store } from './lib/store';
import type { Task } from './lib/types';
import { BodyScreen, BreathSheet, WorkoutSheet } from './screens/Body';
import { HubScreen } from './screens/Hub';
import { AddSheet, TaskSheet, TasksScreen } from './screens/Tasks';
import { PlanSheet, TodayScreen, useDay } from './screens/Today';
import { FocusBar, FocusSheet, usePomodoroClock } from './screens/Focus';
import * as Pomodoro from './lib/pomodoro';
import { sound } from './lib/sound';

const TABS: { id: TabId; label: string; icon: (p?: { size?: number }) => JSX.Element }[] = [
  { id: 'today', label: 'วันนี้', icon: I.today },
  { id: 'tasks', label: 'งาน', icon: I.tasks },
  { id: 'body', label: 'ร่างกาย', icon: I.body },
  { id: 'hub', label: 'เมนู', icon: I.hub },
];

function TabBar(props: { tab: TabId; setTab: (t: TabId) => void; badges: Partial<Record<TabId, number>> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState({ left: 6, width: 0 });
  const [moving, setMoving] = useState(false);
  const measure = () => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${props.tab}"]`);
    if (el) setBlob({ left: el.offsetLeft, width: el.offsetWidth });
  };
  useLayoutEffect(() => {
    measure();
    setMoving(true);
    const t = window.setTimeout(() => setMoving(false), 520);
    return () => window.clearTimeout(t);
  }, [props.tab]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [props.tab]);
  return (
    <nav class="tabbar" aria-label="เมนูหลัก">
      <div class="bar glass" ref={ref} role="tablist">
        <span class={`blob ${moving ? 'moving' : ''}`} style={{ translate: `${blob.left}px 0`, width: blob.width + 'px' } as JSX.CSSProperties} />
        {TABS.map((t) => (
          <button key={t.id} data-tab={t.id} role="tab" aria-selected={props.tab === t.id} class={`tab ${props.tab === t.id ? 'on' : ''}`} onClick={() => props.setTab(t.id)}>
            {t.icon({ size: 22 })}
            {t.label}
            {!!props.badges[t.id] && <span class="badge">{props.badges[t.id]}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Shell() {
  const s = useStore();
  const [tab, setTabRaw] = useLocal<TabId>('bz1:tab', 'today');
  const [hubPage, setHubPage] = useState<HubPage | null>(null);
  const [add, setAdd] = useState<{ text: string; mode: 'task' | 'idea'; due?: string; n: number } | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [workout, setWorkout] = useState<string | null>(null);
  const [breath, setBreath] = useState<string | null>(null);
  const [plan, setPlan] = useState(false);
  const [focus, setFocus] = useState(false);
  const d = useDay();
  usePomodoroClock();

  const setTab = (t: TabId) => {
    if (t === tab && t === 'hub') setHubPage(null);
    setTabRaw(t);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    paintSky();
    const id = window.setInterval(() => paintSky(), 60000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!TABS.some((t) => t.id === tab)) setTabRaw('today');
  }, []);

  const nav: Nav = useMemo(
    () => ({
      tab: setTab,
      task: (t) => setTask(t),
      add: (text, mode = 'task', due) => setAdd({ text, mode, due, n: Date.now() }),
      workout: (id) => setWorkout(id),
      breath: (id) => setBreath(id || 'daily'),
      hub: (p) => {
        setHubPage(p);
        setTabRaw('hub');
        window.scrollTo({ top: 0 });
      },
      inbox: () => {
        setHubPage('inbox');
        setTabRaw('hub');
      },
      plan: () => setPlan(true),
      focus: (t, start) => {
        if (t && Pomodoro.current().phase === 'idle') {
          const link = { taskId: t.id, label: t.title, area: t.area };
          if (start) {
            sound.unlock();
            Pomodoro.startWork(link);
          } else Pomodoro.setLink(link);
        }
        setFocus(true);
      },
    }),
    [tab],
  );

  const alerts = useMemo(
    () => computeAlerts(s, d.now, d.today, d.blocks, d.nowMin, d.checks),
    [s.tasks, s.digests, s.meta, d.now, d.blocks, d.checks],
  );

  if (s.mode === 'local') return <NoStorage />;

  return (
    <div class="app">
      {s.notice && (
        <div class="screen" style={{ paddingBottom: 0, animation: 'none' }}>
          <div class="banner">
            <span class="grow">{s.notice}</span>
            {s.failed > 0 && <button class="btn small" onClick={() => store.retryFailed()}>ลองใหม่</button>}
            <button class="icon-btn" aria-label="ปิดข้อความ" onClick={() => store.dismissNotice()}>{I.close({ size: 16 })}</button>
          </div>
        </div>
      )}
      {tab === 'today' && <TodayScreen nav={nav} alerts={alerts} />}
      {tab === 'tasks' && <TasksScreen nav={nav} />}
      {tab === 'body' && <BodyScreen nav={nav} />}
      {tab === 'hub' && <HubScreen nav={nav} page={hubPage} setPage={setHubPage} alerts={alerts} />}
      <TabBar tab={tab} setTab={setTab} badges={{ hub: alerts.length, tasks: alerts.filter((a) => a.kind === 'flow' || a.kind === 'followup').length }} />

      <AddSheet open={!!add} text={add?.text || ''} mode={add?.mode || 'task'} due={add?.due} onClose={() => setAdd(null)} key={add?.n} />
      <TaskSheet task={task} onClose={() => setTask(null)} nav={nav} />
      <WorkoutSheet programId={workout} onClose={() => setWorkout(null)} />
      <BreathSheet presetId={breath} onClose={() => setBreath(null)} />
      <PlanSheet open={plan} onClose={() => setPlan(false)} key={plan ? 'pl-open' : 'pl'} />
      <FocusSheet open={focus} onClose={() => setFocus(false)} nav={nav} />
      <FocusBar hidden={focus} onOpen={() => setFocus(true)} />
      <ToastHost />
    </div>
  );
}

// Viewers without artifact storage (the Claude iPhone app, previews) would
// show an empty app and silently drop anything typed into it.
function NoStorage() {
  return (
    <div class="screen" id="no-storage">
      <div class="glass pad stack" style={{ marginTop: '10vh' }}>
        <div class="h2">เปิดจากไอคอน Basz OS</div>
        <div class="sub">หน้านี้ถูกเปิดในที่ที่อ่านข้อมูลของคุณไม่ได้ เช่น ในแอป Claude บน iPhone ซึ่งยังไม่รองรับการเก็บข้อมูลของแอปแบบนี้ จึงเห็นแอปว่างเหมือนตัวอย่าง และสิ่งที่แก้ตรงนี้จะไม่ถูกบันทึก</div>
        <div class="sub">แตะไอคอน Basz OS บนหน้าโฮม หรือเปิดลิงก์นี้ใน Safari ข้อมูลทั้งหมดยังอยู่ครบ</div>
      </div>
    </div>
  );
}

export function App() {
  const [error, reset] = useErrorBoundary();
  if (error) {
    return (
      <div class="screen">
        <div class="glass pad stack">
          <div class="h2">มีบางอย่างผิดพลาด</div>
          <div class="sub">ข้อมูลของคุณยังอยู่ครบ ลองเปิดหน้านี้ใหม่อีกครั้ง ถ้ายังเป็นอยู่ให้ส่งข้อความด้านล่างให้ Claude</div>
          <pre class="card pad tiny" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{String((error as Error)?.message || error)}</pre>
          <button class="btn primary" onClick={reset}>ลองใหม่</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div class="sky" aria-hidden="true">
        <i class="b1" />
        <i class="b2" />
        <i class="b3" />
        <i class="b4" />
      </div>
      <div class="sky-scrim" aria-hidden="true" />
      <div class="host-blend" aria-hidden="true" />
      <Shell />
    </>
  );
}
