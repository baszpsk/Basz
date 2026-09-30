// ปฏิทินในหน้าแรก: วันไหนมีนัด งานที่ต้องส่ง หรือต้องตามงานใคร
// แตะชื่อเพื่อแก้ไข แตะนาฬิกาเพื่อเลื่อนวัน และเพิ่มงานลงวันที่เลือกได้ทันที

import { useEffect, useMemo, useState } from 'preact/hooks';
import { I } from '../components/icons';
import { Glass, Sheet, toast, toneOf } from '../components/ui';
import { saveTask } from '../lib/actions';
import { calendarItems, dayItems, type CalItem } from '../lib/calendar';
import { useNow, useStore } from '../lib/hooks';
import type { Nav } from '../lib/nav';
import { AREA_LABEL } from '../lib/priority';
import { addMonths, weekStart } from '../lib/range';
import { addDays, fmtDayLong, fmtShortDate, keyToDate, todayKey, tsAt, wdName, weekday } from '../lib/time';
import { TaskComposer } from './Tasks';

const MO_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const KEY = /^\d{4}-\d{2}-\d{2}$/;

function dayName(d: string, today: string) {
  if (d === today) return 'วันนี้';
  if (d === addDays(today, 1)) return 'พรุ่งนี้';
  if (d === addDays(today, -1)) return 'เมื่อวาน';
  return fmtDayLong(d);
}

function CalRow(props: { x: CalItem; onOpen: () => void; onMove: () => void }) {
  const { x } = props;
  const t = x.task;
  const when = x.overdue > 0 ? `เลยมา ${x.overdue} วัน` : x.time || 'ทั้งวัน';
  return (
    <div class={`calrow${x.done ? ' done' : ''}`}>
      <span class="bar" style={{ background: toneOf(t.area) }} />
      <button class="grow calmain" onClick={props.onOpen}>
        <div class="when" style={x.overdue > 0 ? { color: 'var(--bad)' } : undefined}>
          {when}
          {x.kind === 'follow' ? ' · ตามงาน' : ''}
          {x.done ? ' · เสร็จแล้ว' : ''}
        </div>
        <div class="t">{t.title}</div>
        <div class="d">
          {x.kind === 'follow' && t.waitingOn ? `รอ ${t.waitingOn} · ` : ''}
          {AREA_LABEL[t.area]}
          {t.place && (
            <>
              <span aria-hidden="true"> · </span>
              {I.pin({ size: 13 })}
              {t.place}
            </>
          )}
        </div>
      </button>
      {!x.done && (
        <button class="icon-btn sm" aria-label={`เลื่อนวัน ${t.title}`} onClick={props.onMove}>
          {I.clock({ size: 18 })}
        </button>
      )}
    </div>
  );
}

function MoveSheet(props: { x: CalItem | null; today: string; rollover: number; onClose: () => void }) {
  const { x, today } = props;
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  useEffect(() => {
    if (!x) return;
    setDay(x.day < today ? today : x.day);
    setTime(x.time || '');
  }, [x]);
  const save = (d: string, tm: string) => {
    if (!x || !KEY.test(d)) return;
    const t = x.task;
    // เลื่อนแค่วันและเวลา รายละเอียดอื่นของงานคงเดิม
    if (x.kind === 'follow') saveTask({ ...t, followUpAt: tsAt(d, tm || '10:00', props.rollover) });
    else saveTask({ ...t, due: tm ? `${d}T${tm}` : d });
    toast(`เลื่อนไป${dayName(d, today)}แล้ว`);
    props.onClose();
  };
  const base = x && x.day > today ? x.day : today;
  const quick = x
    ? [
        ...(x.day < today ? [{ id: 'today', label: 'วันนี้', d: today }] : []),
        { id: 'tomorrow', label: 'พรุ่งนี้', d: addDays(today, 1) },
        { id: 'day2', label: 'มะรืน', d: addDays(today, 2) },
        { id: 'monday', label: 'จันทร์หน้า', d: weekStart(addDays(today, 7)) },
        { id: 'week', label: 'อีก 1 สัปดาห์', d: addDays(base, 7) },
      ].filter((q) => q.d !== x.day)
    : [];
  return (
    <Sheet open={!!x} onClose={props.onClose} title="เลื่อนวัน">
      {x && (
        <div class="stack">
          <div>
            <div class="t" style={{ fontWeight: 650 }}>{x.task.title}</div>
            <div class="tiny">ตอนนี้: {dayName(x.day, today)}{x.time ? ` ${x.time}` : ''}</div>
          </div>
          <div class="chips" style={{ flexWrap: 'wrap' }}>
            {quick.map((q) => (
              <button key={q.id} class="chip" id={`move-${q.id}`} onClick={() => save(q.d, time)}>
                {q.label} · {fmtShortDate(q.d)}
              </button>
            ))}
          </div>
          <div class="row" style={{ gap: '10px' }}>
            <label class="datefield grow">
              วันที่
              <input type="date" id="move-date" value={day} onChange={(e) => setDay((e.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="datefield" style={{ width: '124px' }}>
              เวลา
              <input type="time" id="move-time" value={time} onChange={(e) => setTime((e.currentTarget as HTMLInputElement).value)} />
            </label>
          </div>
          <button class="btn primary block" id="move-save" onClick={() => save(day, time)}>บันทึกวันและเวลาใหม่</button>
          {x.kind === 'due' && (
            <button class="btn ghost block" onClick={() => { saveTask({ ...x.task, due: undefined }); toast('เอาวันที่ออกแล้ว'); props.onClose(); }}>
              ไม่ต้องมีวันที่
            </button>
          )}
          <div class="tiny">แก้รายละเอียดอื่นได้โดยแตะชื่องานในปฏิทิน</div>
        </div>
      )}
    </Sheet>
  );
}

export function CalendarCard(props: { nav: Nav }) {
  const s = useStore();
  const now = useNow(60000);
  const R = s.settings.rolloverHour;
  const today = todayKey(now, R);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [sel, setSel] = useState(today);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<CalItem | null>(null);
  // ข้ามวันขณะเปิดหน้าอยู่: ถ้ากำลังดูวันนี้ ให้ตามไปเป็นวันใหม่
  const [was, setWas] = useState(today);
  useEffect(() => {
    if (today === was) return;
    if (sel === was) setSel(today);
    setWas(today);
  }, [today]);
  const map = useMemo(() => calendarItems(s.tasks, today, R), [s.tasks, today, R]);
  const items = dayItems(map, sel, today);
  const month = sel.slice(0, 7);
  const first = weekStart(view === 'week' ? sel : `${month}-01`);
  const last = view === 'week' ? addDays(first, 6) : addDays(weekStart(addDays(addMonths(sel, 1), -1)), 6);
  const days: string[] = [];
  for (let k = first; k <= last; k = addDays(k, 1)) days.push(k);
  const open = (d: string) => {
    setSel(d);
    setAdding(false);
  };
  const shift = (dir: 1 | -1) => {
    if (view === 'week') return open(addDays(sel, 7 * dir));
    const m = addMonths(sel, dir);
    open(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };
  const label = view === 'week' ? `${fmtShortDate(first)} – ${fmtShortDate(last)}` : `${MO_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const pending = (d: string) => (map.get(d) || []).filter((x) => !x.done);
  return (
    <>
      <Glass class="pad stack-sm" id="calendar">
        <div class="row between">
          <div class="h3">ปฏิทิน</div>
          <div class="row" style={{ gap: '6px' }}>
            {sel !== today && <button class="chip" onClick={() => open(today)}>วันนี้</button>}
            <button class="chip" id="cal-view" onClick={() => setView(view === 'week' ? 'month' : 'week')}>{view === 'week' ? 'ดูทั้งเดือน' : 'ดูสัปดาห์'}</button>
          </div>
        </div>
        <div class="row between">
          <button class="icon-btn sm" aria-label={view === 'week' ? 'สัปดาห์ก่อน' : 'เดือนก่อน'} onClick={() => shift(-1)}>{I.back({ size: 18 })}</button>
          <div class="tiny" style={{ fontWeight: 700 }}>{label}</div>
          <button class="icon-btn sm" aria-label={view === 'week' ? 'สัปดาห์ถัดไป' : 'เดือนถัดไป'} onClick={() => shift(1)}>{I.arrow({ size: 18 })}</button>
        </div>
        <div class={`cal-grid${view === 'month' ? ' cal-month' : ''}`}>
          {view === 'month' && [1, 2, 3, 4, 5, 6, 0].map((w) => <div key={w} class="cal-wd">{wdName(w)}</div>)}
          {days.map((d) => {
            const list = pending(d);
            return (
              <button
                key={d}
                class={`calday${d === today ? ' today' : ''}${d === sel ? ' sel' : ''}${view === 'month' && d.slice(0, 7) !== month ? ' out' : ''}`}
                aria-pressed={d === sel}
                aria-label={`${fmtDayLong(d)} ${list.length ? `${list.length} รายการ` : 'ว่าง'}`}
                onClick={() => open(d)}
              >
                {view === 'week' && <span class="wd">{wdName(weekday(d))}</span>}
                <span class="dn">{keyToDate(d).getDate()}</span>
                <span class="dots">{list.slice(0, 3).map((x, i) => <i key={i} style={{ background: toneOf(x.task.area) }} />)}</span>
              </button>
            );
          })}
        </div>
        <div class="row between" style={{ marginTop: '4px' }}>
          <div class="h3">{dayName(sel, today)}</div>
          <button class="chip" id="cal-add" onClick={() => setAdding(!adding)}>{I.plus({ size: 14 })} เพิ่ม</button>
        </div>
        {adding && (
          <TaskComposer
            id="cal-composer"
            placeholder={`นัดหรืองานของ${dayName(sel, today)} เช่น นัดหมอฟัน 15:00 ที่คลินิก`}
            onSubmit={(text, mode) => {
              props.nav.add(text, mode, sel);
              setAdding(false);
            }}
          />
        )}
        <div>
          {items.map((x) => <CalRow key={x.kind + x.task.id} x={x} onOpen={() => props.nav.task(x.task)} onMove={() => setMoving(x)} />)}
          {!items.length && <div class="empty">ไม่มีนัดหรืองานที่ลงวันที่ไว้</div>}
        </div>
      </Glass>
      <MoveSheet x={moving} today={today} rollover={R} onClose={() => setMoving(null)} />
    </>
  );
}
