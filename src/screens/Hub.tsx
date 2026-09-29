import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BarChart, HeatMap } from '../components/charts';
import { I } from '../components/icons';
import { burstFrom, Check, Empty, Glass, Pill, Progress, Ring, Seg, toast } from '../components/ui';
import { FABRICS, LOADS, MACHINE_CARE, SMELL_FIX } from '../content/laundry';
import { markSeen, newTask, saveMeta, saveSettings, saveShop, saveTask, setCycleMinutes, startLaundry } from '../lib/actions';
import { coach, copyForError, sampleCap } from '../lib/ai';
import type { Alert } from '../lib/alerts';
import { cap } from '../lib/claude';
import { useNow, useStore } from '../lib/hooks';
import type { HubPage, Nav } from '../lib/nav';
import { sound } from '../lib/sound';
import { store } from '../lib/store';
import { buildDay } from '../lib/schedule';
import { addDays, fmtHM, fmtShortDate, parseHM as parseHMx, relTime, todayKey, wdName, weekday } from '../lib/time';
import type { DigestItem, ShopItem } from '../lib/types';
import { computeStats } from '../lib/xp';

const TILES: { id: HubPage; name: string; sub: string; icon: (p?: { size?: number }) => JSX.Element; tone: string }[] = [
  { id: 'seoulful', name: 'Seoulful', sub: 'Sales · reviews · ideas', icon: I.store, tone: 'var(--a-seoulful)' },
  { id: 'markets', name: 'Markets', sub: 'SET news · routine', icon: I.chart, tone: 'var(--a-trading)' },
  { id: 'inbox', name: 'Inbox', sub: 'Important email', icon: I.mail, tone: 'var(--a-home)' },
  { id: 'laundry', name: 'Laundry', sub: 'Loads · care · flow', icon: I.shirt, tone: 'var(--a-home)' },
  { id: 'shop', name: 'Shopping', sub: 'What to buy · prices', icon: I.cart, tone: 'var(--a-personal)' },
  { id: 'stats', name: 'Stats', sub: 'Level · trophies', icon: I.trophy, tone: 'var(--a-trading)' },
  { id: 'coach', name: 'Ask Claude', sub: 'Questions on your plan', icon: I.spark, tone: 'var(--a-growth)' },
  { id: 'hairline', name: 'Hairline', sub: 'Photo tracker', icon: I.camera, tone: 'var(--a-personal)' },
  { id: 'alarm', name: 'Alarm & sleep', sub: 'Wake-up setup', icon: I.alarm, tone: 'var(--a-growth)' },
  { id: 'settings', name: 'Settings', sub: 'Schedule · backup', icon: I.gear, tone: 'var(--ink-2)' },
];

function PageHead(props: { title: string; eyebrow?: string; onBack: () => void; right?: ComponentChildren }) {
  return (
    <div class="topbar">
      <button class="icon-btn" aria-label="Back" onClick={props.onBack}>{I.back({ size: 20 })}</button>
      <div class="grow">
        {props.eyebrow && <div class="eyebrow">{props.eyebrow}</div>}
        <h1 class="h1" style={{ fontSize: '22px' }}>{props.title}</h1>
      </div>
      {props.right}
    </div>
  );
}

function DigestList(props: { items: (DigestItem & { date: string })[]; empty: ComponentChildren }) {
  const seen = store.s.meta.seen || {};
  if (!props.items.length) return <Glass>{props.empty}</Glass>;
  return (
    <Glass class="list">
      {props.items.map((it) => {
        const id = `dg-${it.date}-${it.id}`;
        return (
          <div key={id} class="item" style={{ alignItems: 'flex-start' }}>
            <span style={{ color: it.priority === 'high' ? 'var(--warn)' : 'var(--ink-3)', marginTop: '2px' }}>
              {it.kind === 'review' ? I.spark() : it.kind === 'sales' ? I.chart() : it.kind === 'news' ? I.news() : I.mail()}
            </span>
            <div class="grow">
              <div class="t row" style={{ gap: '6px' }}>
                {!seen[id] && <span class="area-dot" style={{ '--tone': 'var(--accent)' } as JSX.CSSProperties} />}
                {it.title}
              </div>
              {it.body && <div class="d" style={{ whiteSpace: 'pre-wrap' }}>{it.body}</div>}
              <div class="tiny">
                {it.source}{it.at ? ` · ${it.at}` : ` · ${fmtShortDate(it.date)}`}
                {it.rating ? ` · ${'★'.repeat(Math.round(it.rating))}` : ''}
                {it.url && <> · <a href={it.url} target="_blank" rel="noopener noreferrer">Open</a></>}
              </div>
            </div>
          </div>
        );
      })}
    </Glass>
  );
}

function useDigestItems(kinds: DigestItem['kind'][], days = 7) {
  const s = useStore();
  return useMemo(() => {
    const out: (DigestItem & { date: string })[] = [];
    Object.values(s.digests)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, days)
      .forEach((d) => Object.values(d.items || {}).forEach((it) => kinds.includes(it.kind) && out.push({ ...it, date: d.date })));
    return out;
  }, [s.digests]);
}

const NOT_CONNECTED = (what: string, body = 'Claude สรุปจาก Gmail ให้ทุกเช้าก่อนคุณตื่น รายการแรกจะขึ้นหลังรอบถัดไป') => (
  <Empty title={`No ${what} yet`} body={body} />
);
const FROM_COMPANY = 'อีเมลแจ้งยอดขายและรีวิวส่งเข้าเมลบริษัท ส่วนนี้จะเริ่มมีข้อมูลหลังตั้ง forward เมลบริษัทมาที่เมลส่วนตัว (ขั้นตอนอยู่ในแชท)';

function SeoulfulPage(props: { nav: Nav; back: () => void }) {
  const s = useStore();
  const sales = useDigestItems(['sales'], 14);
  const reviews = useDigestItems(['review'], 14);
  const waiting = Object.values(s.tasks).filter((t) => t.status === 'waiting' && t.area === 'seoulful');
  const open = Object.values(s.tasks).filter((t) => t.status === 'todo' && t.area === 'seoulful');
  const [idea, setIdea] = useState('');
  const links = s.plan?.links || [];
  const avg = reviews.filter((r) => r.rating).map((r) => r.rating as number);
  return (
    <div class="screen">
      <PageHead title="Seoulful" eyebrow="서울풀 · Rama 9" onBack={props.back} />
      <div class="tiles">
        <div class="tile"><div class="k">OPEN TASKS</div><div class="v">{open.length}</div></div>
        <div class="tile"><div class="k">WAITING ON</div><div class="v">{waiting.length}</div></div>
        <div class="tile"><div class="k">REVIEWS · 14D</div><div class="v">{reviews.length}{avg.length ? <span class="tiny"> · {(avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1)}★</span> : ''}</div></div>
      </div>
      <div class="section-head"><h2 class="h2">Sales</h2></div>
      <DigestList items={sales} empty={NOT_CONNECTED('sales summary', FROM_COMPANY)} />
      <div class="section-head"><h2 class="h2">Reviews & ratings</h2></div>
      <DigestList items={reviews} empty={NOT_CONNECTED('reviews', FROM_COMPANY)} />
      <div class="section-head"><h2 class="h2">Ideas → tasks</h2></div>
      <Glass class="pad stack-sm">
        <textarea id="idea-box" class="textarea" placeholder="เช่น อยากเพิ่มเมนูซุปกิมจิชีส ขายช่วงหน้าฝน" value={idea} onInput={(e) => setIdea((e.target as HTMLTextAreaElement).value)} />
        <button class="btn primary" disabled={!idea.trim()} onClick={() => { props.nav.add(idea.trim(), 'idea'); setIdea(''); }}>{I.wand({ size: 18 })} Break into steps</button>
      </Glass>
      {waiting.length > 0 && (
        <>
          <div class="section-head"><h2 class="h2">Waiting on staff</h2></div>
          <Glass class="list">
            {waiting.map((t) => (
              <button key={t.id} class="item" onClick={() => props.nav.task(t)}>
                <div class="grow"><div class="t">{t.title}</div><div class="d">{t.waitingOn} · chase {t.followUpAt ? relTime(t.followUpAt, Date.now()) : '—'}</div></div>
              </button>
            ))}
          </Glass>
        </>
      )}
      <div class="section-head"><h2 class="h2">Your storefronts</h2></div>
      <Glass class="list">
        {links.length ? links.map((l) => (
          <a key={l.id} class="item" href={l.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
            <span style={{ color: 'var(--a-seoulful)' }}>{l.kind === 'maps' ? I.store() : I.link()}</span>
            <div class="grow"><div class="t">{l.label}</div><div class="d">{l.kind === 'maps' ? 'Google Maps' : l.kind === 'booking' ? 'Booking' : 'Delivery'}</div></div>
            {I.arrow({ size: 18 })}
          </a>
        )) : <Empty title="Links are loading" />}
      </Glass>
    </div>
  );
}

function MarketsPage(props: { back: () => void }) {
  const s = useStore();
  const now = useNow(60000);
  const news = useDigestItems(['news'], 7);
  // The trading blocks of today, or of the next trading day, straight from the scheduler.
  const trade = useMemo(() => {
    let key = todayKey(now, s.settings.rolloverHour);
    for (let i = 0; i < 7 && !s.settings.tradingDays.includes(weekday(key)); i++) key = addDays(key, 1);
    return buildDay(key, s.settings, s.plan).filter((b) => b.kind === 'trade');
  }, [s.settings, s.plan, todayKey(now, s.settings.rolloverHour)]);
  return (
    <div class="screen">
      <PageHead title="Markets" eyebrow="SET · mai" onBack={props.back} />
      <Glass class="pad stack-sm">
        <div class="h3">Your trading routine</div>
        <div class="list">
          {trade.map((b) => [`${fmtHM(b.start)}–${fmtHM(b.end)}`, b.title, b.sub || '']).map(([t, a, b]) => (
            <div key={a} class="item" style={{ padding: '10px 2px' }}>
              <span class="tiny num" style={{ width: '92px' }}>{t}</span>
              <div class="grow"><div class="t">{a}</div><div class="d">{b}</div></div>
            </div>
          ))}
        </div>
      </Glass>
      <div class="section-head"><h2 class="h2">Market news</h2><span class="tiny">สรุปโดย Claude</span></div>
      <DigestList items={news} empty={<Empty title="No news digest yet" body="เว็บ set.or.th และ settrade.com ปิดกั้นระบบอัตโนมัติทุกตัว Claude จึงดึงข่าวทางการมาสรุปเองไม่ได้ ข่าวที่ส่งเข้า Gmail (เช่นจากโบรกเกอร์) จะถูกสรุปขึ้นที่นี่" />} />
    </div>
  );
}

function InboxPage(props: { alerts: Alert[]; nav: Nav; back: () => void }) {
  const emails = useDigestItems(['email', 'note'], 7);
  const all = props.alerts;
  return (
    <div class="screen">
      <PageHead
        title="Inbox"
        eyebrow={`${all.length} need attention`}
        onBack={props.back}
        right={all.some((a) => a.kind === 'digest') ? <button class="chip" onClick={() => { markSeen(all.filter((a) => a.kind === 'digest').map((a) => a.id)); toast('Marked as read'); }}>Mark read</button> : undefined}
      />
      <Glass class="list">
        {all.filter((a) => a.kind !== 'digest').length ? all.filter((a) => a.kind !== 'digest').map((a) => (
          <button key={a.id} class="item" onClick={() => a.task && props.nav.task(a.task)}>
            <span style={{ color: a.urgent ? 'var(--warn)' : 'var(--ink-3)' }}>{a.kind === 'med' ? I.pill() : a.kind === 'flow' ? I.shirt() : a.kind === 'followup' ? I.user() : I.clock()}</span>
            <div class="grow"><div class="t">{a.title}</div>{a.body && <div class="d">{a.body}</div>}</div>
          </button>
        )) : <Empty title="All clear" body="ไม่มีงานที่เลยกำหนดหรือรอติดตาม" />}
      </Glass>
      <div class="section-head"><h2 class="h2">Important email</h2><span class="tiny">Personal · Seoulful</span></div>
      <DigestList items={emails} empty={NOT_CONNECTED('email summary')} />
    </div>
  );
}

function LaundryPage(props: { back: () => void }) {
  const s = useStore();
  const now = useNow(60000);
  const today = todayKey(now, s.settings.rolloverHour);
  const active = Object.values(s.tasks).filter((t) => t.flow?.id === 'laundry' && t.status === 'todo');
  const [sel, setSel] = useState<string[]>(LOADS.filter((l) => l.day === now.getDay()).map((l) => l.id));
  const [tab, setTab] = useState<'run' | 'guide' | 'care'>('run');
  const addCare = () => {
    for (const c of MACHINE_CARE) {
      if (Object.values(s.tasks).some((t) => t.title === `Machine: ${c.title}` && t.status !== 'done')) continue;
      saveTask(newTask({ title: `Machine: ${c.title}`, notes: c.th, area: 'home', impact: 1, estimateMin: 10, repeatDays: c.everyDays, due: addDays(today, c.id === 'gasket' ? 0 : 3), source: 'flow' }));
    }
    toast('Machine care reminders added');
  };
  return (
    <div class="screen">
      <PageHead title="Laundry" eyebrow="LG 12 kg · AI DD · Steam" onBack={props.back} />
      <Seg id="laundry-tab" options={[{ id: 'run', label: 'Run' }, { id: 'guide', label: 'Fabric guide' }, { id: 'care', label: 'Care' }]} value={tab} onChange={setTab} />
      {tab === 'run' && (
        <>
          {active.length > 0 && (
            <Glass class="list">
              {active.sort((a, b) => (a.notBefore || 0) - (b.notBefore || 0)).map((t) => (
                <div key={t.id} class="item">
                  <span style={{ color: 'var(--a-home)' }}>{I.shirt()}</span>
                  <div class="grow"><div class="t">{t.title}</div><div class="d">{t.notBefore && t.notBefore > Date.now() ? `at ${relTime(t.notBefore, Date.now())}` : 'Now'}</div></div>
                  <Pill tone="var(--a-home)">Step {(t.flow?.step ?? 0) + 1}/4</Pill>
                </div>
              ))}
            </Glass>
          )}
          <Glass class="pad stack">
            <div class="h3">Start a run</div>
            <div class="sub">แผนแนะนำ: อาทิตย์ = ผ้าเช็ดตัว/ผ้าปู + ชุดชั้นใน · พุธ = ผ้าสี (+ยีนส์เมื่อถึงรอบ) ซักช่วงสาย แล้วตากช่วงกลางวัน</div>
            <div class="card list">
              {LOADS.map((l) => {
                const on = sel.includes(l.id);
                const mins = s.meta.flowDurations?.[l.id] ?? l.cycleMin;
                return (
                  <div key={l.id} class="item">
                    <Check on={on} tone="var(--a-home)" label={l.name} onToggle={() => setSel(on ? sel.filter((x) => x !== l.id) : [...sel, l.id])} />
                    <div class="grow">
                      <div class="t">{l.name} <span class="tiny">· {wdName(l.day)}</span></div>
                      <div class="d">{l.what}</div>
                      <div class="d">{l.program}</div>
                    </div>
                    <label class="tiny" style={{ display: 'grid', gap: '2px', textAlign: 'center' }}>
                      <input
                        class="input"
                        style={{ width: '64px', padding: '6px', textAlign: 'center', fontSize: '15px' }}
                        inputMode="numeric"
                        aria-label={`${l.name} cycle minutes`}
                        value={String(mins)}
                        onChange={(e) => {
                          const v = Number((e.target as HTMLInputElement).value);
                          if (v > 0 && v < 400) setCycleMinutes(l.id, v);
                        }}
                      />
                      min
                    </label>
                  </div>
                );
              })}
            </div>
            <div class="tiny">ใส่เวลาของรอบซักตามที่หน้าจอเครื่องแสดงครั้งแรก ระบบจะจำและเตือนให้ตากตรงเวลา</div>
            <button class="btn primary" disabled={!sel.length} onClick={(e) => { startLaundry(sel); sound.done(); burstFrom(e, 'Started'); toast('Laundry flow started: wash → hang → collect → put away'); }}>
              {I.play({ size: 18 })} Start {sel.length} load{sel.length === 1 ? '' : 's'}
            </button>
          </Glass>
          <Glass class="pad guide">
            <div class="h3">Why clothes smell musty & how to stop it</div>
            <ul>{SMELL_FIX.map((x) => <li key={x}>{x}</li>)}</ul>
          </Glass>
          <Glass class="pad stack-sm">
            <div class="field">
              <label for="dry-hours">Indoor drying time (hours)</label>
              <input id="dry-hours" class="input" inputMode="numeric" value={String(s.settings.dryHours)} onChange={(e) => { const v = Number((e.target as HTMLInputElement).value); if (v > 0 && v < 48) saveSettings({ dryHours: v }); }} />
            </div>
          </Glass>
        </>
      )}
      {tab === 'guide' && (
        <Glass class="list">
          {FABRICS.map((f) => (
            <div key={f.id} class="item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '6px' }}>
              <div class="row between" style={{ width: '100%' }}><div class="t">{f.name}</div><Pill tone="var(--a-home)">{f.load}</Pill></div>
              <div class="d">{f.items}</div>
              <div class="row wrap" style={{ gap: '6px' }}>
                <Pill>{f.program}</Pill><Pill>{f.temp}</Pill><Pill>spin {f.spin}</Pill>
              </div>
              <div class="sub">{f.options}</div>
              <div class="sub">ตาก: {f.dry}</div>
              <div class="tiny">ความถี่: {f.every}</div>
            </div>
          ))}
        </Glass>
      )}
      {tab === 'care' && (
        <>
          <Glass class="list">
            {MACHINE_CARE.map((c) => (
              <div key={c.id} class="item" style={{ alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--a-home)' }}>{I.gear()}</span>
                <div class="grow"><div class="t">{c.title} <span class="tiny">· every {c.everyDays} d</span></div><div class="d">{c.th}</div></div>
              </div>
            ))}
          </Glass>
          <button class="btn primary" onClick={addCare}>Add these as repeating reminders</button>
        </>
      )}
    </div>
  );
}

const CAT_LABEL: Record<ShopItem['category'], string> = { health: 'Health', skin: 'Skin', hair: 'Hair', dental: 'Teeth', laundry: 'Laundry', home: 'Home', fitness: 'Fitness', sleep: 'Sleep' };
const STATUS: { id: ShopItem['status']; label: string }[] = [
  { id: 'need', label: 'Need' },
  { id: 'have', label: 'Have' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'ask', label: 'Ask doctor' },
  { id: 'skip', label: 'Skip' },
];

function ShopPage(props: { back: () => void }) {
  const s = useStore();
  const [filter, setFilter] = useState<'need' | 'all'>('need');
  const items = Object.values(s.shop).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const shown = filter === 'need' ? items.filter((i) => i.status === 'need' || i.status === 'ordered' || i.status === 'ask') : items;
  const cats = [...new Set(shown.map((i) => i.category))];
  const total = items.filter((i) => i.status === 'need' && i.priceTHB).reduce((a, i) => a + (i.priceTHB || 0), 0);
  return (
    <div class="screen">
      <PageHead title="Shopping" eyebrow={`${items.filter((i) => i.status === 'need').length} to buy${total ? ` · ~฿${total.toLocaleString()}` : ''}`} onBack={props.back} />
      <Seg id="shop-filter" options={[{ id: 'need', label: 'To buy' }, { id: 'all', label: 'Everything' }]} value={filter} onChange={setFilter} />
      <div class="banner">ราคาเปลี่ยนทุกวัน และ Shopee/Lazada ปิดกั้นระบบอัตโนมัติด้วย captcha Claude จึงดึงราคาเองไม่ได้ ปุ่ม Shopee ↑฿ และ Lazada ↑฿ เปิดผลค้นหาที่เรียงจากถูกสุดให้ทันที</div>
      {!items.length && <Glass><Empty title="List is loading" /></Glass>}
      {cats.map((c) => (
        <div key={c} class="stack-sm">
          <div class="section-head"><h2 class="h2">{CAT_LABEL[c]}</h2></div>
          <Glass class="list">
            {shown.filter((i) => i.category === c).map((i) => (
              <div key={i.id} class="item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '8px' }}>
                <div class="row between" style={{ width: '100%', alignItems: 'flex-start' }}>
                  <div class="grow">
                    <div class="t">{i.name}{i.qty ? <span class="tiny"> · {i.qty}</span> : ''}</div>
                    <div class="d">{i.why}</div>
                    {i.conditional && <div class="tiny" style={{ color: 'var(--warn)' }}>เงื่อนไข: {i.conditional}</div>}
                  </div>
                  {i.priceTHB ? <div class="display-num" style={{ fontSize: '16px' }}>฿{i.priceTHB.toLocaleString()}</div> : null}
                </div>
                {i.priceNote && <div class="tiny">{i.priceNote}{i.priceCheckedAt ? ` · checked ${fmtShortDate(todayKey(new Date(i.priceCheckedAt), 6))}` : ''}</div>}
                <div class="chips" style={{ width: '100%' }}>
                  {STATUS.map((st) => (
                    <button key={st.id} class={`chip ${i.status === st.id ? 'on' : ''}`} onClick={() => saveShop({ ...i, status: st.id })}>{st.label}</button>
                  ))}
                </div>
                <div class="row wrap" style={{ gap: '8px' }}>
                  {i.bestLink && <a class="btn small" href={i.bestLink} target="_blank" rel="noopener noreferrer">{I.cart({ size: 16 })} Best deal</a>}
                  <a class="btn small ghost" href={`https://shopee.co.th/search?keyword=${encodeURIComponent(i.query)}&order=asc&sortBy=price`} target="_blank" rel="noopener noreferrer">Shopee ↑฿</a>
                  <a class="btn small ghost" href={`https://www.lazada.co.th/catalog/?q=${encodeURIComponent(i.query)}&sort=priceasc`} target="_blank" rel="noopener noreferrer">Lazada ↑฿</a>
                </div>
              </div>
            ))}
          </Glass>
        </div>
      ))}
    </div>
  );
}

function StatsPage(props: { back: () => void }) {
  const s = useStore();
  const now = useNow(60000);
  const today = todayKey(now, s.settings.rolloverHour);
  const st = useMemo(() => computeStats(s.logs, s.tasks, s.plan, today, s.settings.rolloverHour), [s.logs, s.tasks, s.plan, today]);
  const prog = (st.xp - st.levelFloor) / Math.max(1, st.levelNext - st.levelFloor);
  const done = st.achievements.filter((a) => a.earned).length;
  return (
    <div class="screen">
      <PageHead title="Stats" eyebrow="Level · challenges · trophies" onBack={props.back} />
      <Glass class="hero" tone="var(--a-trading)">
        <div class="glow" />
        <div class="row" style={{ gap: '16px' }}>
          <Ring value={prog} size={92} stroke={7} tone="var(--a-trading)" label={`Level ${st.level}`}>
            <div class="center"><div class="display-num" style={{ fontSize: '26px' }}>{st.level}</div><div class="tiny">LEVEL</div></div>
          </Ring>
          <div class="grow">
            <div class="eyebrow">{st.levelName}</div>
            <div class="display-num" style={{ fontSize: '28px' }}>{st.xp.toLocaleString()} XP</div>
            <div class="tiny">{(st.levelNext - st.xp).toLocaleString()} XP to level {st.level + 1} · +{st.todayXp} today</div>
          </div>
        </div>
      </Glass>
      <div class="section-head"><h2 class="h2">This week's challenges</h2></div>
      <Glass class="pad stack">
        {st.challenges.map((c) => (
          <div key={c.id} class="stack-sm">
            <div class="row between"><span class="h3">{c.title}</span><span class="tiny num">{Math.round(c.value)}/{c.target} {c.unit}</span></div>
            <Progress value={c.value / c.target} tone={c.value >= c.target ? 'var(--good)' : 'var(--accent)'} label={c.title} />
          </div>
        ))}
      </Glass>
      <div class="tiles">
        <div class="tile"><div class="k">TASKS DONE</div><div class="v">{st.tasks.doneTotal}</div><div class="tiny">{st.tasks.doneWeek} this week</div></div>
        <div class="tile"><div class="k">WORKOUTS</div><div class="v">{st.workouts.total}</div><div class="tiny">{st.workouts.thisWeek} this week</div></div>
        <div class="tile"><div class="k">BREATHING</div><div class="v">{Math.round(st.breath.totalMin)}</div><div class="tiny">minutes total</div></div>
      </div>
      <Glass class="pad stack-sm">
        <div class="h3">Workouts · 12 weeks</div>
        <HeatMap data={st.workouts.days} unit="workouts" title="Workouts per day" tone="var(--a-health)" />
      </Glass>
      <Glass class="pad stack-sm">
        <div class="h3">Breathing · 14 days</div>
        <BarChart data={st.breath.days.map((p) => ({ key: p.key, label: fmtShortDate(p.key), value: Math.round(p.value) }))} unit="min" title="Breathing minutes per day" tone="var(--a-home)" labelLast />
      </Glass>
      <div class="section-head"><h2 class="h2">Trophies</h2><span class="tiny">{done}/{st.achievements.length}</span></div>
      <div class="grid2">
        {st.achievements.map((a) => (
          <div key={a.id} class="glass hubtile" style={{ '--tone': a.earned ? 'var(--a-trading)' : 'var(--ink-3)', opacity: a.earned ? 1 : 0.7, minHeight: '0' } as JSX.CSSProperties}>
            <span class="ic">{I.trophy({ size: 20 })}</span>
            <div><div class="h3">{a.title}</div><div class="tiny">{a.desc}</div></div>
            {!a.earned && <Progress value={a.progress || 0} tone="var(--a-trading)" label={a.title} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function CoachPage(props: { back: () => void }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [busy, setBusy] = useState(false);
  const [avail, setAvail] = useState<boolean | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => {
    sampleCap().then((x) => setAvail(!!x));
  }, []);
  const ask = async () => {
    if (!q.trim()) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setA('');
    const ctx = [
      `Settings: ${JSON.stringify(s.settings)}`,
      `Medicines: ${(s.plan?.meds || []).map((m) => `${m.name} @${m.time}`).join('; ')}`,
      `Plan: ${(s.plan?.guides || []).map((g) => `${g.title}: ${g.points.join(' / ')}`).join('\n')}`,
      `Open tasks: ${Object.values(s.tasks).filter((t) => t.status === 'todo').map((t) => t.title).slice(0, 30).join('; ')}`,
    ].join('\n');
    try {
      await coach(q.trim(), ctx, setA, c.signal);
    } catch (e) {
      const m = copyForError(e);
      if (m) setA((x) => (x ? x + '\n\n' : '') + m);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="screen">
      <PageHead title="Ask Claude" eyebrow="Uses your plan as context" onBack={props.back} />
      {avail === false && <div class="banner">Claude is not available in this view.</div>}
      <Glass class="pad stack-sm">
        <textarea id="coach-q" class="textarea" placeholder="เช่น คืนนี้จะไปดื่ม ควรเตรียมตัวยังไง / มื้อเย็นวันนี้แม่ทำหมูทอด กินได้ไหม" value={q} onInput={(e) => setQ((e.target as HTMLTextAreaElement).value)} />
        <div class="row" style={{ gap: '8px' }}>
          <button class="btn primary" disabled={busy || !q.trim() || avail === false} onClick={ask}>{busy ? 'Thinking…' : 'Ask'}</button>
          {busy && <button class="btn ghost" onClick={() => ctl.current?.abort()}>Stop</button>}
        </div>
      </Glass>
      {a && <Glass class="pad"><div style={{ whiteSpace: 'pre-wrap', fontSize: '15px' }}>{a}</div></Glass>}
      <div class="tiny center">คำตอบเป็นข้อมูลทั่วไป เรื่องยาให้ยึดตามแพทย์ที่รักษา</div>
    </div>
  );
}

function HairlinePage(props: { back: () => void }) {
  const s = useStore();
  const [assets, setAssets] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    cap('assets').then(setAssets);
  }, []);
  const photos = (s.meta.photos || []).slice().sort((a, b) => a.at - b.at);
  const last = photos[photos.length - 1];
  const due = !last || Date.now() - last.at > 85 * 86400000;
  const upload = async (file: File) => {
    if (!assets) return;
    setBusy(true);
    try {
      const r = await assets.upload(file);
      saveMeta({ photos: [...(s.meta.photos || []), { id: r.id, url: r.url, at: Date.now() }] });
      toast('Photo saved');
    } catch {
      toast('Could not save the photo. Try a smaller image.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="screen">
      <PageHead title="Hairline" eyebrow="Every 3 months · same light, same angle" onBack={props.back} />
      <Glass class="pad stack-sm">
        <div class="sub">แนว M ที่เป็นมาตั้งแต่ ม.5–ม.6 และที่บ้านไม่มีใครศีรษะล้าน เข้าได้กับแนวผมโดยธรรมชาติที่คงที่มากกว่าผมบางจากฮอร์โมน รูปเทียบทุก 3 เดือนคือวิธีที่ไม่มีข้อเสียเลยในการยืนยัน ถ้าเห็นถอยจริงค่อยพบแพทย์ผิวหนัง</div>
        <div class="tiny">ถ่ายหน้าตรง ผมปัดขึ้น แสงเดิม ระยะเดิม ไม่ใส่ผลิตภัณฑ์จัดแต่งผม</div>
        {assets === null && <div class="banner">การเก็บรูปยังไม่พร้อมใช้งานในมุมมองนี้</div>}
        {assets && (
          <label class={`btn ${due ? 'primary' : ''}`} style={{ cursor: 'pointer' }}>
            {I.camera({ size: 18 })} {busy ? 'Saving…' : due ? 'Add this quarter’s photo' : 'Add a photo'}
            <input type="file" accept="image/*" capture="user" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) upload(f); }} />
          </label>
        )}
      </Glass>
      {photos.length >= 2 && (
        <Glass class="pad stack-sm">
          <div class="h3">First vs latest</div>
          <div class="grid2">
            {[photos[0], last].map((p) => (
              <figure key={p.id} style={{ margin: 0 }}>
                <img src={p.url} alt={`Hairline ${fmtShortDate(todayKey(new Date(p.at), 6))}`} style={{ width: '100%', borderRadius: '14px', aspectRatio: '3/4', objectFit: 'cover' }} />
                <figcaption class="tiny center">{fmtShortDate(todayKey(new Date(p.at), 6))}</figcaption>
              </figure>
            ))}
          </div>
        </Glass>
      )}
      {photos.length > 0 && (
        <Glass class="pad">
          <div class="grid2">
            {photos.slice().reverse().map((p) => (
              <figure key={p.id} style={{ margin: 0 }}>
                <img src={p.url} alt="Hairline photo" loading="lazy" style={{ width: '100%', borderRadius: '12px', aspectRatio: '3/4', objectFit: 'cover' }} />
                <figcaption class="tiny center">{fmtShortDate(todayKey(new Date(p.at), 6))}</figcaption>
              </figure>
            ))}
          </div>
        </Glass>
      )}
    </div>
  );
}

function AlarmPage(props: { back: () => void }) {
  const s = useStore();
  const R = s.settings.rolloverHour;
  const inBed = (parseHMx(s.settings.wake, R) + 1440 - parseHMx(s.settings.lightsOut, R)) / 60;
  return (
    <div class="screen">
      <PageHead title="Alarm & sleep" eyebrow={`Lights out ${s.settings.lightsOut} · wake ${s.settings.wake}`} onBack={props.back} />
      <Glass class="pad stack-sm">
        <div class="h3">ทำไมใช้นาฬิกาปลุกของ iPhone</div>
        <div class="sub">Apple อนุญาตให้ปลุกทะลุโหมดพระจันทร์ (Focus) และโหมดเงียบได้เฉพาะนาฬิกาปลุกของระบบ และแอปที่ติดตั้งจาก App Store ที่ใช้ AlarmKit เว็บแอปทุกตัวรวมถึงแอปนี้ทำไม่ได้ วิธีที่ได้ผล 100% ตอนนี้คือใช้ตาราง Sleep ของ iPhone ตามเวลาที่แอปคำนวณไว้</div>
      </Glass>
      <Glass class="pad guide">
        <div class="h3">ตั้งครั้งเดียว ใช้ได้ทุกวัน</div>
        <ul>
          <li>เปิดแอป <b>Health</b> → <b>Browse</b> → <b>Sleep</b> → <b>Full Schedule & Options</b></li>
          <li>ตั้ง <b>Bedtime {s.settings.lightsOut}</b> และ <b>Wake Up {s.settings.wake}</b> เลือกทุกวัน (Every Day)</li>
          <li>เปิด <b>Alarm</b> ในตารางเดียวกัน เสียงนี้ปลุกทะลุโหมดพระจันทร์และโหมดเงียบ</li>
          <li>ตั้ง <b>Wind Down 60 นาที</b> ให้ iPhone เข้าโหมด Sleep เองก่อนเวลานอน</li>
        </ul>
      </Glass>
      <Glass class="pad stack-sm">
        <div class="h3">Your sleep window</div>
        <div class="sub">ขึ้นเตียงและปิดไฟ {s.settings.lightsOut} · ตื่น {s.settings.wake} · อยู่บนเตียง {inBed.toFixed(1)} ชม. เป้าหมายหลับจริงราว {(inBed - 0.5).toFixed(1)} ชม. (หักเวลาก่อนหลับราว 15 นาทีและตื่นกลางดึกสั้นๆ) เวลาตื่นที่เท่ากันทุกวันสำคัญกว่าจำนวนชั่วโมง</div>
      </Glass>
    </div>
  );
}

function SettingsPage(props: { back: () => void }) {
  const s = useStore();
  const st = s.settings;
  const [downloads, setDownloads] = useState<any>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    cap('downloads').then(setDownloads);
  }, []);
  const time = (id: keyof typeof st, label: string) => (
    <div class="field">
      <label for={`set-${id}`}>{label}</label>
      <input id={`set-${id}`} type="time" class="input" value={String(st[id])} onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) saveSettings({ [id]: v } as any); }} />
    </div>
  );
  const days = (key: 'workoutDays' | 'tradingDays', label: string) => (
    <div class="field">
      <label>{label}</label>
      <div class="chips">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const on = st[key].includes(d);
          return <button key={d} class={`chip ${on ? 'on' : ''}`} onClick={() => saveSettings({ [key]: on ? st[key].filter((x) => x !== d) : [...st[key], d].sort() } as any)}>{wdName(d)}</button>;
        })}
      </div>
    </div>
  );
  const backup = async () => {
    const data = JSON.stringify(store.exportAll(), null, 1);
    if (!downloads) {
      toast('Backup download is not available here');
      return;
    }
    try {
      await downloads.save({ filename: `basz-os-backup-${todayKey(new Date(), 6)}.json`, data });
      toast('Backup saved');
    } catch (e: any) {
      if (e?.code !== 'declined') toast('Backup was not saved');
    }
  };
  const restore = async (f: File) => {
    try {
      store.importAll(JSON.parse(await f.text()));
      toast('Backup restored');
    } catch (e: any) {
      toast(e?.message || 'Could not read that file');
    }
  };
  return (
    <div class="screen">
      <PageHead title="Settings" onBack={props.back} />
      <Glass class="pad stack">
        <div class="h3">Daily rhythm</div>
        <div class="grid2">
          {time('wake', 'Wake up')}
          {time('lightsOut', 'Lights out')}
          {time('meal1', 'Brunch')}
          {time('meal2', 'Dinner')}
          {time('workoutTime', 'Workout')}
          {time('coffeeCutoff', 'Caffeine cut-off')}
        </div>
        <div class="tiny">มื้อแรกควรห่างจากยาก่อนอาหารเช้า 30–60 นาที มื้อเย็นต้องเสร็จก่อนนอนอย่างน้อย 3 ชม.</div>
        {days('workoutDays', 'Workout days')}
        {days('tradingDays', 'Trading days')}
      </Glass>
      <Glass class="pad stack">
        <div class="h3">Your data</div>
        <div class="row between">
          <span class="sub">Cloud sync</span>
          <Pill tone={s.mode === 'cloud' ? 'var(--good)' : 'var(--warn)'}>{s.mode === 'cloud' ? (s.synced ? 'On · synced' : 'Connecting') : s.mode === 'local' ? 'This device only' : 'Starting'}</Pill>
        </div>
        <div class="row between"><span class="sub">Unsent changes</span><span class="num">{s.pending}</span></div>
        {s.failed > 0 && <button class="btn small" onClick={() => store.retryFailed()}>Retry {s.failed} unsaved change(s)</button>}
        <div class="tiny">ข้อมูลเก็บบนเซิร์ฟเวอร์ของ Claude และสำรองในเครื่องนี้ ถ้าเน็ตหลุด การเปลี่ยนแปลงจะรอส่งเองเมื่อกลับมาออนไลน์</div>
        <div class="row wrap" style={{ gap: '8px' }}>
          <button class="btn small" onClick={backup}>{I.download({ size: 16 })} Save backup file</button>
          <button class="btn small ghost" onClick={() => fileRef.current?.click()}>{I.upload({ size: 16 })} Restore</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) restore(f); }} />
        </div>
      </Glass>
      <div class="tiny center">Basz OS · build {__BUILD_TIME__.slice(0, 10)}</div>
    </div>
  );
}

declare const __BUILD_TIME__: string;

export function HubScreen(props: { nav: Nav; page: HubPage | null; setPage: (p: HubPage | null) => void; alerts: Alert[] }) {
  const s = useStore();
  const back = () => props.setPage(null);
  const counts: Partial<Record<HubPage, number>> = {
    inbox: props.alerts.length,
    shop: Object.values(s.shop).filter((i) => i.status === 'need').length,
    laundry: Object.values(s.tasks).filter((t) => t.flow?.id === 'laundry' && t.status === 'todo').length,
  };
  switch (props.page) {
    case 'seoulful': return <SeoulfulPage nav={props.nav} back={back} />;
    case 'markets': return <MarketsPage back={back} />;
    case 'inbox': return <InboxPage alerts={props.alerts} nav={props.nav} back={back} />;
    case 'laundry': return <LaundryPage back={back} />;
    case 'shop': return <ShopPage back={back} />;
    case 'stats': return <StatsPage back={back} />;
    case 'coach': return <CoachPage back={back} />;
    case 'hairline': return <HairlinePage back={back} />;
    case 'alarm': return <AlarmPage back={back} />;
    case 'settings': return <SettingsPage back={back} />;
  }
  return (
    <div class="screen">
      <div class="topbar">
        <div class="grow">
          <div class="eyebrow">Everything else</div>
          <h1 class="h1">Hub</h1>
        </div>
      </div>
      {s.mode === 'local' && <div class="banner">This view keeps data on this device only. Open Basz OS from its link to sync.</div>}
      <div class="grid2">
        {TILES.map((t) => (
          <button key={t.id} class="glass hubtile" style={{ '--tone': t.tone } as JSX.CSSProperties} onClick={() => props.setPage(t.id)}>
            <div class="row between">
              <span class="ic">{t.icon({ size: 20 })}</span>
              {!!counts[t.id] && <Pill tone={t.tone}>{counts[t.id]}</Pill>}
            </div>
            <div><div class="h3">{t.name}</div><div class="tiny">{t.sub}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}
