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
import { CheckinSheet, PlanSheet, TodayScreen, useDay } from './screens/Today';

const TABS: { id: TabId; label: string; icon: (p?: { size?: number }) => JSX.Element }[] = [
  { id: 'today', label: 'Today', icon: I.today },
  { id: 'tasks', label: 'Tasks', icon: I.tasks },
  { id: 'body', label: 'Body', icon: I.body },
  { id: 'hub', label: 'Hub', icon: I.hub },
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
    <nav class="tabbar" aria-label="Main">
      <div class="bar glass" ref={ref} role="tablist">
        <span class={`blob ${moving ? 'moving' : ''}`} style={{ left: blob.left + 'px', width: blob.width + 'px' }} />
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
  const [add, setAdd] = useState<{ text: string; mode: 'task' | 'idea'; n: number } | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [workout, setWorkout] = useState<string | null>(null);
  const [breath, setBreath] = useState<string | null>(null);
  const [checkin, setCheckin] = useState(false);
  const [plan, setPlan] = useState(false);
  const d = useDay();

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
      add: (text, mode = 'task') => setAdd({ text, mode, n: Date.now() }),
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
      checkin: () => setCheckin(true),
      plan: () => setPlan(true),
    }),
    [tab],
  );

  const alerts = useMemo(
    () => computeAlerts(s, d.now, d.today, d.blocks, d.nowMin, d.checks),
    [s.tasks, s.digests, s.meta, d.now, d.blocks, d.checks],
  );

  return (
    <div class="app">
      {s.notice && (
        <div class="screen" style={{ paddingBottom: 0, animation: 'none' }}>
          <div class="banner">
            <span class="grow">{s.notice}</span>
            {s.failed > 0 && <button class="btn small" onClick={() => store.retryFailed()}>Retry</button>}
            <button class="icon-btn" aria-label="Dismiss" onClick={() => store.dismissNotice()}>{I.close({ size: 16 })}</button>
          </div>
        </div>
      )}
      {tab === 'today' && <TodayScreen nav={nav} alerts={alerts} />}
      {tab === 'tasks' && <TasksScreen nav={nav} />}
      {tab === 'body' && <BodyScreen nav={nav} />}
      {tab === 'hub' && <HubScreen nav={nav} page={hubPage} setPage={setHubPage} alerts={alerts} />}
      <TabBar tab={tab} setTab={setTab} badges={{ hub: alerts.length, tasks: alerts.filter((a) => a.kind === 'flow' || a.kind === 'followup').length }} />

      <AddSheet open={!!add} text={add?.text || ''} mode={add?.mode || 'task'} onClose={() => setAdd(null)} key={add?.n} />
      <TaskSheet task={task} onClose={() => setTask(null)} nav={nav} />
      <WorkoutSheet programId={workout} onClose={() => setWorkout(null)} />
      <BreathSheet presetId={breath} onClose={() => setBreath(null)} />
      <CheckinSheet open={checkin} onClose={() => setCheckin(false)} key={checkin ? 'ci-open' : 'ci'} />
      <PlanSheet open={plan} onClose={() => setPlan(false)} key={plan ? 'pl-open' : 'pl'} />
      <ToastHost />
    </div>
  );
}

export function App() {
  const [error, reset] = useErrorBoundary();
  if (error) {
    return (
      <div class="screen">
        <div class="glass pad stack">
          <div class="h2">Something went wrong</div>
          <div class="sub">ข้อมูลของคุณยังอยู่ครบ ลองเปิดหน้านี้ใหม่อีกครั้ง ถ้ายังเป็นอยู่ให้ส่งข้อความด้านล่างให้ Claude</div>
          <pre class="card pad tiny" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{String((error as Error)?.message || error)}</pre>
          <button class="btn primary" onClick={reset}>Try again</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div class="sky" aria-hidden="true" />
      <div class="sky-scrim" aria-hidden="true" />
      <div class="host-blend" aria-hidden="true" />
      <Shell />
    </>
  );
}
