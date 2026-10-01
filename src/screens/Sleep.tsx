// การนอนจากการเปิดปิด Basz OS: การ์ดเมื่อคืนในหน้าวันนี้ และประวัติในหน้าร่างกาย
// ถามเจ้าของเมื่อรูปแบบแปลก (ดูเหตุผลใน sleeplog.ts) ค่าที่เจ้าของเลือกเก็บไว้คนละช่องกับค่าที่แอปเดา

import { useMemo, useState } from 'preact/hooks';
import { BarChart } from '../components/charts';
import { Empty, Glass, Sheet, toast } from '../components/ui';
import { patchDay } from '../lib/actions';
import { useNow, useStore } from '../lib/hooks';
import {
  bedTsAt, chosen, hmOf, lastWakeDate, MAX_NIGHT, pickOf, planInBed, skipPick, sleepNights, sleepOf, timeStats, wakeDateFor, wakeTsAt,
  type AskReason, type Chosen, type Span,
} from '../lib/sleeplog';
import { addDays, daysBetween, fmtDuration, fmtHM, fmtShortDate } from '../lib/time';
import type { SleepRec } from '../lib/types';

const ASK_TEXT: Record<AskReason, string> = {
  none: 'ไม่เจอช่วงที่ไม่ได้เปิด Basz OS นานพอจะเป็นการนอน',
  short: 'ช่วงที่ไม่ได้เปิด Basz OS สั้นกว่า 4 ชั่วโมง',
  split: 'มีการเปิด Basz OS กลางดึก ช่วงนอนเลยถูกตัดเป็นสองท่อน',
  odd: 'เวลาห่างจากแผนเกิน 2 ชั่วโมง',
  evening: 'ตอนค่ำก่อนนอนไม่ได้เปิด Basz OS จึงไม่รู้เวลาวางมือถือ',
  morning: 'ก่อน 15:00 ยังไม่ได้เปิด Basz OS จึงไม่รู้เวลาเริ่มใช้',
};

type Plan = { lightsOut: string; wake: string };
const hrs = (min: number) => String(Math.round(min / 6) / 10);
const spanText = (s: Span) => `${hmOf(s.bed)} → ${hmOf(s.wake)} · ${fmtDuration((s.wake - s.bed) / 60000)}`;
const nightName = (k: string, today: string | null) => (k === today ? 'เมื่อคืน' : `คืนก่อน ${fmtShortDate(k)}`);

/** เลือกช่วงที่แอปเจอ กรอกเวลาเอง หรือบอกว่าไม่นับคืนนี้ */
export function SleepEditor(props: { date: string; rec?: SleepRec | null; plan: Plan; onDone?: () => void }) {
  const { date, rec, plan } = props;
  const g = rec?.auto;
  const u = rec?.user;
  const opts: { id: string; hint: string; span: Span }[] = [];
  if (g?.merged) opts.push({ id: 'sleep-merge', hint: 'นับเป็นช่วงเดียว ลุกมาเปิดแอปแป๊บเดียว', span: g.merged });
  if (g?.bedTs != null && g?.wakeTs != null) opts.push({ id: 'sleep-main', hint: 'ช่วงที่ไม่ได้เปิดแอปนานที่สุด', span: { bed: g.bedTs, wake: g.wakeTs } });
  (g?.alt || []).forEach((a, i) => opts.push({ id: `sleep-alt-${i}`, hint: 'ช่วงที่ไม่ได้เปิดแอปอีกช่วง', span: a }));
  const [manual, setManual] = useState(!opts.length || !!u);
  const [bed, setBed] = useState(u?.bed ?? g?.bed ?? plan.lightsOut);
  const [wake, setWake] = useState(u?.wake ?? g?.wake ?? plan.wake);

  const done = (msg: string) => {
    toast(msg);
    props.onDone?.();
  };
  const pick = (span: Span) => {
    patchDay(date, { sleep: { user: pickOf(span) } });
    done('บันทึกแล้ว');
  };
  const save = () => {
    if (!bed || !wake) return toast('ใส่เวลาให้ครบทั้งสองช่อง');
    const b = bedTsAt(date, bed);
    const w = wakeTsAt(date, wake);
    if (w <= b) return toast('เวลาเริ่มใช้ต้องหลังเวลาวางมือถือ');
    if (w - b > MAX_NIGHT) return toast('ช่วงนี้ยาวเกิน 16 ชั่วโมง ลองดูเวลาอีกครั้ง');
    pick({ bed: b, wake: w });
  };

  return (
    <div class="stack-sm">
      {opts.map((o) => (
        <button key={o.id} id={o.id} class="sleep-opt" onClick={() => pick(o.span)}>
          <span class="t num">{spanText(o.span)}</span>
          <span class="d">{o.hint}</span>
        </button>
      ))}
      {manual ? (
        <div class="stack-sm">
          <div class="row" style={{ gap: '10px' }}>
            <label class="datefield grow">วางมือถือ<input id="sleep-bed" type="time" value={bed} onInput={(e) => setBed((e.target as HTMLInputElement).value)} /></label>
            <label class="datefield grow">เริ่มใช้<input id="sleep-wake" type="time" value={wake} onInput={(e) => setWake((e.target as HTMLInputElement).value)} /></label>
          </div>
          <button id="sleep-save" class="btn small primary" onClick={save}>บันทึกเวลานี้</button>
        </div>
      ) : (
        <button id="sleep-manual" class="btn small" onClick={() => setManual(true)}>ไม่ใช่ทั้งหมด กรอกเวลาเอง</button>
      )}
      <div class="row wrap" style={{ gap: '8px' }}>
        <button id="sleep-skip" class="btn small ghost" onClick={() => { patchDay(date, { sleep: { user: skipPick() } }); done('ไม่นับคืนนี้แล้ว'); }}>ไม่นับคืนนี้</button>
        {u && g && (
          <button id="sleep-reset" class="btn small ghost" onClick={() => { patchDay(date, { sleep: { user: null } }); done('กลับไปใช้เวลาที่แอปจดแล้ว'); }}>ใช้เวลาที่แอปจด</button>
        )}
      </div>
    </div>
  );
}

function AskCard(props: { date: string; today: string; rec: SleepRec; plan: Plan }) {
  const ask = (props.rec.auto?.ask || []) as AskReason[];
  return (
    <Glass class="pad stack-sm" id="sleep-ask">
      <div class="h3">{nightName(props.date, props.today)} วางมือถือกี่โมง</div>
      <div class="sub">{ask.map((r) => ASK_TEXT[r]).filter(Boolean).join(' · ')}</div>
      <SleepEditor date={props.date} rec={props.rec} plan={props.plan} />
    </Glass>
  );
}

function BriefCard(props: { date: string; rec: SleepRec; c: Chosen; plan: Plan }) {
  const { c, plan } = props;
  const [edit, setEdit] = useState(false);
  const mins = c.bedTs != null && c.wakeTs != null ? (c.wakeTs - c.bedTs) / 60000 : null;
  return (
    <Glass class="pad stack-sm" id="sleep-card">
      <div class="row between">
        <div class="h3">เมื่อคืน</div>
        <span class="tiny">{c.src === 'user' ? 'คุณยืนยันแล้ว' : 'จากการเปิดปิด Basz OS'}</span>
      </div>
      <div class="sleep-line">
        <div><div class="k">วางมือถือ</div><div class="v num">{c.bed ?? '–'}</div></div>
        <div><div class="k">เริ่มใช้</div><div class="v num">{c.wake ?? '–'}</div></div>
        <div><div class="k">บนเตียงราว</div><div class="v">{mins != null ? hrs(mins) : '–'}{mins != null && <span class="tiny"> ชม.</span>}</div></div>
      </div>
      <div class="tiny">แผน {plan.lightsOut}–{plan.wake} · {hrs(planInBed(plan.lightsOut, plan.wake))} ชม.</div>
      {edit ? (
        <SleepEditor date={props.date} rec={props.rec} plan={plan} onDone={() => setEdit(false)} />
      ) : (
        <button id="sleep-edit" class="btn small ghost" onClick={() => setEdit(true)}>แก้เวลา</button>
      )}
    </Glass>
  );
}

/** หน้าวันนี้: ถามเมื่อรูปแบบแปลก ไม่งั้นแสดงสรุปเมื่อคืนจนถึง 15:00 */
export function SleepCard() {
  const s = useStore();
  const now = useNow(60000);
  const today = wakeDateFor(now);
  if (!today) return null;
  const plan = s.settings;
  const needsAsk = (k: string) => {
    const r = sleepOf(s.logs, k);
    return r && !r.user && r.auto?.ask?.length ? r : null;
  };
  // ก่อนเวลาตื่นตามแผน คืนนี้อาจยังไม่จบ จึงยังไม่ถาม
  const canAsk = now.getTime() >= wakeTsAt(today, plan.wake) || now.getHours() >= 15;
  const askToday = canAsk ? needsAsk(today) : null;
  if (askToday) return <AskCard date={today} today={today} rec={askToday} plan={plan} />;
  const y = addDays(today, -1);
  const askY = needsAsk(y);
  if (askY) return <AskCard date={y} today={today} rec={askY} plan={plan} />;
  const rec = sleepOf(s.logs, today);
  const c = chosen(rec);
  if (!rec || !c || c.src === 'skip' || c.ask.length || now.getHours() >= 15) return null;
  return <BriefCard date={today} rec={rec} c={c} plan={plan} />;
}

const STATUS: Record<Chosen['src'] | 'ask' | 'none', string> = {
  user: 'ยืนยันแล้ว',
  auto: 'จากการเปิดปิดแอป',
  skip: 'ไม่นับ',
  ask: 'รอคุณตอบ',
  none: 'ไม่มีข้อมูล',
};

/** หน้าร่างกาย: 14 คืนล่าสุด แตะคืนไหนก็แก้ได้ */
export function SleepHistory() {
  const s = useStore();
  const now = useNow(60000);
  const last = lastWakeDate(now);
  const today = wakeDateFor(now);
  const plan = s.settings;
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => sleepNights(s.logs, last, 14), [s.logs, last]);
  const week = rows.filter((r) => daysBetween(r.key, last) < 7);
  const avg = week.length ? week.reduce((a, r) => a + r.minutes, 0) / week.length : null;
  const bedS = timeStats(week, 'bedTs');
  const wakeS = timeStats(week, 'wakeTs');
  const planMin = planInBed(plan.lightsOut, plan.wake);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const days = Array.from({ length: 14 }, (_, i) => addDays(last, i - 13));
  // คืนก่อนเริ่มจดไม่ต้องแสดง เหลือแค่คืนที่มีข้อมูลกับเมื่อคืน
  const recent = days.slice(-7).reverse().filter((k) => k === last || chosen(sleepOf(s.logs, k)));
  const statusOf = (k: string) => {
    const c = chosen(sleepOf(s.logs, k));
    if (!c) return 'none';
    return c.src === 'auto' && c.ask.length ? 'ask' : c.src;
  };

  return (
    <Glass class="pad stack-sm" id="sleep-history">
      <div>
        <div class="h3">เวลาวางมือถือตอนกลางคืน</div>
        <div class="tiny">7 คืนล่าสุด · มีข้อมูล {week.length} คืน</div>
      </div>
      {rows.length ? (
        <>
          <div class="tiles">
            <div class="tile"><div class="k">บนเตียงเฉลี่ย</div><div class="v">{avg != null ? hrs(avg) : '–'}<span class="tiny"> ชม.</span></div><div class="tiny">แผน {hrs(planMin)} ชม.</div></div>
            <div class="tile"><div class="k">วางมือถือเฉลี่ย</div><div class="v">{bedS ? fmtHM(bedS.mean) : '–'}</div>{bedS && <div class="tiny">±{Math.round(bedS.sd)} นาที</div>}</div>
            <div class="tile"><div class="k">เริ่มใช้เฉลี่ย</div><div class="v">{wakeS ? fmtHM(wakeS.mean) : '–'}</div>{wakeS && <div class="tiny">±{Math.round(wakeS.sd)} นาที</div>}</div>
          </div>
          <div class="tiny">± คือแต่ละคืนห่างจากค่าเฉลี่ยราวกี่นาที ยิ่งน้อยยิ่งสม่ำเสมอ</div>
          <BarChart
            title="ชั่วโมงบนเตียงแต่ละคืน"
            unit="ชม."
            tone="var(--a-growth)"
            guide={{ value: planMin / 60, label: `แผน ${hrs(planMin)} ชม.` }}
            data={days.map((k) => {
              const r = byKey.get(k);
              return { key: k, label: fmtShortDate(k), value: r ? Math.round(r.minutes / 6) / 10 : undefined, note: 'ไม่มีข้อมูล', sub: r ? `วาง ${hmOf(r.bedTs)} · ใช้ ${hmOf(r.wakeTs)}` : undefined };
            })}
          />
        </>
      ) : (
        <Empty title="ยังไม่มีข้อมูลการนอน" body="Basz OS บน iPhone จดเวลาที่เปิดและปิดแอปเอง เช้าหลังคืนแรกจะเห็นเวลาวางมือถือและเวลาเริ่มใช้ที่นี่" />
      )}
      <div class="list">
        {recent.map((k) => {
          const c = chosen(sleepOf(s.logs, k));
          const st = statusOf(k);
          return (
            <button key={k} class="item" data-night={k} onClick={() => setOpen(k)}>
              <div class="grow">
                <div class="t">{nightName(k, today)}</div>
                <div class="d num">{c && (c.bed || c.wake) ? `วาง ${c.bed ?? '?'} · ใช้ ${c.wake ?? '?'}` : '–'}</div>
              </div>
              <span class="tiny" style={{ color: st === 'ask' ? 'var(--warn)' : undefined }}>{STATUS[st]}</span>
            </button>
          );
        })}
      </div>
      <div class="tiny">เวลาเหล่านี้มาจากตอนที่เปิดและปิด Basz OS บน iPhone เท่านั้น ถ้าปิดแอปแล้วใช้แอปอื่นต่อ เวลาวางมือถือจะเร็วกว่าความจริง และไม่ใช่เวลาที่หลับจริง</div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? nightName(open, today) : ''}>
        {open && (
          <div class="stack">
            {(() => {
              const rec = sleepOf(s.logs, open);
              const ask = (rec && !rec.user ? rec.auto?.ask || [] : []) as AskReason[];
              return (
                <>
                  {!!ask.length && <div class="sub">{ask.map((r) => ASK_TEXT[r]).join(' · ')}</div>}
                  <SleepEditor key={open} date={open} rec={rec} plan={plan} onDone={() => setOpen(null)} />
                </>
              );
            })()}
          </div>
        )}
      </Sheet>
    </Glass>
  );
}
