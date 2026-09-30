// Basz OS on the Home Screen and Lock Screen, for the ScriptWidget app.
// widget/build.mjs puts two things above this file: BASZ (settings
// and medicines) and BaszEngine (the app's own day builder),
// so the widget shows exactly the blocks and times the app shows.
//
// The widget cannot read the app's database, so it shows the plan, not ticks.
// Countdowns use the system timer so they stay right between refreshes.

const E = BaszEngine;
const WD = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const size = $getenv('widget-size') || 'large';
const param = String($getenv('widget-param') || '');

// Settings baked in at build time. A time in the widget's Parameter field
// (for example 00:45) overrides lights-out after the sleep coach moves it.
const st = Object.assign({}, E.DEFAULT_SETTINGS, BASZ.settings || {});
const lo = /(\d{1,2})[:.](\d{2})/.exec(param);
if (lo) st.lightsOut = (lo[1].length === 1 ? '0' : '') + lo[1] + ':' + lo[2];

const now = new Date();
const R = st.rolloverHour;
const today = E.todayKey(now, R);
const tomorrow = E.addDays(today, 1);
const nowMin = E.logicalMinutes(now, R);
const plan = { meds: BASZ.meds || [] };
const blocksToday = E.buildDay(today, st, plan);
const W = E.parseHM(st.wake, R);
const L = E.parseHM(st.lightsOut, R);
const hm = E.fmtHM;

// Day: after waking. Wind-down: the last 90 minutes before lights-out.
// Asleep: from lights-out until the wake time (no countdown: clock-watching
// in bed keeps people awake).
const asleep = nowMin >= L || nowMin < W;
const winding = !asleep && nowMin >= L - 90;
const night = asleep || winding;

const cur = blocksToday.find((b) => b.kind !== 'sleep' && nowMin >= b.start && nowMin < b.end);
// Upcoming blocks, running into tomorrow once today's are over.
const tomorrowStart = E.buildDay(tomorrow, st, plan).filter((b) => b.kind !== 'sleep').map((b) => ({ b, key: tomorrow }));
const upcoming = blocksToday
  .filter((b) => b.kind !== 'sleep' && b.start > nowMin)
  .map((b) => ({ b, key: today }))
  .concat(nowMin >= L ? tomorrowStart : []);

const shortMed = (name) => name.split(' (')[0].replace(/\s*\d+\s*mg$/i, '');
const medsFor = (key) => {
  const wd = E.keyToDate(key).getDay();
  return plan.meds
    .filter((m) => !m.days || m.days.indexOf(wd) >= 0)
    .map((m) => ({ name: shortMed(m.name), min: E.medMinutes(m, st), key }))
    .sort((a, b) => a.min - b.min);
};
// The next medicine time (a 10 minute grace keeps a just-due dose visible).
const medQueue = medsFor(today).filter((m) => m.min >= nowMin - 10).concat(medsFor(tomorrow));
const nextMeds = medQueue.length ? medQueue.filter((m) => m.min === medQueue[0].min && m.key === medQueue[0].key) : [];
const medLabel = nextMeds.length ? (nextMeds[0].key !== today ? 'พรุ่งนี้ · ' : '') + nextMeds[0].name + (nextMeds.length > 1 ? ' +' + (nextMeds.length - 1) : '') : '';
const bedtimeMeds = nextMeds.length > 0 && nextMeds[0].key === today && nextMeds[0].min >= L - 90;

const coffeeCut = E.parseHM(E.caffeineCutoff(st), R);
const inBedMin = W + 1440 - L;
const lightsTs = E.tsAtMinutes(today, L);
const dayDate = E.keyToDate(today);
const dateLabel = `${WD[dayDate.getDay()]} ${dayDate.getDate()} ${MO[dayDate.getMonth()]}`;
const cut = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trim() + '…' : s || '');
const hours = (m) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} ชม.` : r === 30 ? `${h}½ ชม.` : `${h}:${String(r).padStart(2, '0')} ชม.`;
};

// ---------- Look ----------
const P = night
  ? {
      bg: $gradient({ type: 'linear', colors: ['#15133A', '#2A1F58', '#4A2B6E'], startPoint: 'topLeading', endPoint: 'bottomTrailing' }),
      card: '#FFFFFF,0.11', soft: '#FFFFFF,0.07', ink: '#F4EFFF', ink2: '#D3C8F1', ink3: '#A497CA',
      head: '#EDE6FF', track: '#FFFFFF,0.16', shadow: null,
      brand: $gradient({ type: 'linear', colors: ['#A9B6FF', '#E3A6FF'], startPoint: 'leading', endPoint: 'trailing' }),
    }
  : {
      bg: $gradient({ type: 'linear', colors: ['#FFDDB0', '#FFAE98', '#FF86B3'], startPoint: 'topLeading', endPoint: 'bottomTrailing' }),
      card: '#FFFFFF,0.82', soft: '#FFFFFF,0.6', ink: '#221331', ink2: '#4D395B', ink3: '#7F6A8B',
      head: '#3A1A35', track: '#221331,0.1', shadow: '#2E7A3858,12,0,5',
      brand: $gradient({ type: 'linear', colors: ['#2F6BFF', '#8B5CF6'], startPoint: 'leading', endPoint: 'trailing' }),
    };
const AREA = night
  ? { health: '#34D399', seoulful: '#FF8A70', trading: '#FBBF24', home: '#60A5FA', growth: '#A78BFA', personal: '#F472B6' }
  : { health: '#0CA678', seoulful: '#FF5438', trading: '#F59F00', home: '#1C7ED6', growth: '#7048E8', personal: '#E64980' };
const tone = (b) => (b && AREA[b.area]) || (night ? '#A497CA' : '#9A7FA3');

// ---------- Pieces ----------
function Card(children, opts) {
  const o = opts || {};
  return (
    <vstack alignment="leading" spacing={o.gap || '6'} padding={o.pad || '12'} background={o.bg || P.card} corner={o.r || '18'} shadow={P.shadow || undefined}>
      {children}
    </vstack>
  );
}

function Eyebrow(label, dot) {
  return (
    <hstack spacing="6">
      {dot ? <circle color={dot} frame="7" /> : null}
      <text font="12,semibold" color={P.ink3}>{label}</text>
      <spacer />
    </hstack>
  );
}

function Header() {
  return (
    <hstack spacing="6">
      <text font="14,bold" color={P.head}>{dateLabel}</text>
      <spacer />
      <text font="12,heavy,rounded" color={P.brand}>Basz OS</text>
    </hstack>
  );
}

function NowCard(big) {
  if (!cur) return null;
  const total = cur.end - cur.start;
  const done = Math.min(Math.max(nowMin - cur.start, 0), total);
  const items = big ? (cur.items || []).filter((i) => i.kind !== 'med').slice(0, 2).map((i) => i.label) : [];
  const meds = big ? (cur.items || []).filter((i) => i.kind === 'med').map((i) => shortMed(i.label)) : [];
  return Card([
    Eyebrow(`ตอนนี้ · ${hm(cur.start)}–${hm(cur.end)}`, tone(cur)),
    <text font={big ? '24,bold' : '21,bold'} color={P.ink}>{cut(cur.title, 24)}</text>,
    cur.sub ? <text font="13" color={P.ink2}>{cut(cur.sub, big ? 64 : 46)}</text> : null,
    meds.length ? <text font="13,semibold" color={P.ink}>{'ยา: ' + meds.join(' · ')}</text> : null,
    items.length ? <text font="13" color={P.ink2}>{'ทำ: ' + items.join(' · ')}</text> : null,
    <progress value={done} total={total} color={tone(cur)} trackColor={P.track} thickness="6" />,
  ]);
}

function Row(entry, withSub) {
  const b = entry.b;
  return (
    <hstack spacing="10" alignment="top">
      <text font="14,semibold,rounded" color={P.ink} frame="46,max,leading">{hm(b.start)}</text>
      <circle color={tone(b)} frame="7" padding="top,6" />
      <vstack alignment="leading" spacing="1">
        <text font="14,medium" color={P.ink}>{cut(b.title, 26)}</text>
        {withSub && b.sub ? <text font="11" color={P.ink3}>{cut(b.sub, 40)}</text> : null}
      </vstack>
      <spacer />
    </hstack>
  );
}

function NextCard(count, withSub, title, from) {
  const list = (from || upcoming).slice(0, count);
  if (!list.length) return null;
  return Card([Eyebrow(title || 'ถัดไป')].concat(list.map((e) => Row(e, withSub))), { gap: '7' });
}

function Chip(label, value, extra) {
  return (
    <vstack alignment="leading" spacing="2" padding="9" frame="max,topLeading" background={P.soft} corner="16">
      <text font="11,semibold" color={P.ink3}>{label}</text>
      <text font="15,bold,rounded" color={P.ink}>{value}</text>
      {extra || null}
    </vstack>
  );
}

function Timer(ts, font, align) {
  return <date date={ts} style="timer" font={font || '12,semibold,rounded'} color={P.ink2} alignment={align || 'leading'} />;
}

function DayChips() {
  const coffee = nowMin < coffeeCut ? Chip('กาแฟ', `ถึง ${hm(coffeeCut)}`, <text font="11" color={P.ink2}>หลังอาหาร</text>) : Chip('กาแฟ', 'หยุดแล้ว', <text font="11" color={P.ink2}>งดถึงพรุ่งนี้</text>);
  const med = MedChip();
  const sleep = Chip('ปิดไฟ', st.lightsOut, Timer(lightsTs));
  return (
    <hstack spacing="8" frame="max,74">
      {coffee}
      {med}
      {sleep}
    </hstack>
  );
}

function MedChip() {
  if (!nextMeds.length) return Chip('ยา', 'ไม่มี', <text font="11" color={P.ink2}>ตามแผน</text>);
  return Chip(bedtimeMeds ? 'ยาก่อนนอน' : 'ยาถัดไป', hm(nextMeds[0].min), <text font="11" color={P.ink2}>{cut(medLabel, 18)}</text>);
}

function WindCard(big) {
  return Card([
    <hstack spacing="8">
      <icon systemName="moon.stars.fill" size="16" color={P.ink2} />
      <text font="12,semibold" color={P.ink3}>ผ่อนคลายก่อนนอน</text>
      <spacer />
    </hstack>,
    <hstack spacing="8" alignment="bottom">
      <text font={big ? '30,bold,rounded' : '26,bold,rounded'} color={P.ink}>{`ปิดไฟ ${st.lightsOut}`}</text>
      <spacer />
      <vstack alignment="trailing" spacing="0">
        <text font="11,semibold" color={P.ink3}>อีก</text>
        {Timer(lightsTs, '17,semibold,rounded', 'trailing')}
      </vstack>
    </hstack>,
    big ? <text font="13" color={P.ink2}>หรี่ไฟ · วางมือถือ · นั่งนอกเตียงจนถึงเวลา</text> : null,
  ]);
}

function StepsCard() {
  const steps = blocksToday.filter((b) => b.end > nowMin && b.start < L && b.start >= L - 90);
  const rows = [];
  for (const b of steps) {
    const items = (b.items || []).filter((i) => i.kind !== 'med').map((i) => i.label);
    rows.push(
      <hstack spacing="10" alignment="top">
        <text font="14,semibold,rounded" color={P.ink} frame="46,max,leading">{hm(b.start)}</text>
        <vstack alignment="leading" spacing="1">
          <text font="14,medium" color={P.ink}>{cut(b.title, 26)}</text>
          {items.length ? <text font="11" color={P.ink3}>{cut(items.join(' · '), 48)}</text> : null}
        </vstack>
        <spacer />
      </hstack>,
    );
  }
  if (!rows.length) return null;
  return Card([Eyebrow('ก่อนนอน')].concat(rows), { gap: '8' });
}

function NightChips() {
  return (
    <hstack spacing="8" frame="max,74">
      {MedChip()}
      {Chip('ตื่น', st.wake, <text font="11" color={P.ink2}>ทุกวัน</text>)}
      {Chip('อยู่บนเตียง', hours(inBedMin), <text font="11" color={P.ink2}>นอนตะแคงซ้าย</text>)}
    </hstack>
  );
}

function SleepCard(big) {
  return Card([
    <hstack spacing="8">
      <icon systemName="moon.zzz.fill" size="16" color={P.ink2} />
      <text font="12,semibold" color={P.ink3}>เวลานอน</text>
      <spacer />
    </hstack>,
    <text font={big ? '28,bold' : '24,bold'} color={P.ink}>นอนหลับได้เลย</text>,
    <text font="13" color={P.ink2}>ยังไม่หลับใน 20 นาที ลุกไปนั่งที่แสงสลัว</text>,
    big ? <text font="13" color={P.ink2}>ง่วงแล้วค่อยกลับเตียง · นอนตะแคงซ้าย</text> : null,
  ]);
}

// ---------- Sizes ----------
// iOS cannot open a Home Screen web app from a widget: a link lands in the
// Claude app (no storage, so an empty app) or in Safari (its own bars). So
// the whole widget is one refresh button: a tap updates it in place and
// opens nothing. The app itself opens from its Home Screen icon.
function root(children, pad, gap) {
  return (
    <vstack spacing="0" frame="max" background={P.bg}>
      <button action="reload" frame="max">
        <vstack alignment="leading" spacing={gap || '10'} padding={pad || '14'} frame="max,topLeading">
          {children}
        </vstack>
      </button>
    </vstack>
  );
}

function small() {
  if (asleep)
    return root([
      <icon systemName="moon.zzz.fill" size="22" color={P.ink2} />,
      <text font="18,bold" color={P.ink}>นอนหลับได้เลย</text>,
      <spacer />,
      <text font="11,semibold" color={P.ink3}>ตื่น</text>,
      <text font="22,bold,rounded" color={P.ink}>{st.wake}</text>,
    ], '14', '4');
  if (winding)
    return root([
      <icon systemName="moon.stars.fill" size="20" color={P.ink2} />,
      <text font="11,semibold" color={P.ink3}>ปิดไฟ</text>,
      <text font="26,bold,rounded" color={P.ink}>{st.lightsOut}</text>,
      <hstack spacing="4"><text font="12" color={P.ink2}>อีก</text>{Timer(lightsTs, '14,semibold,rounded')}</hstack>,
      <spacer />,
      <text font="11" color={P.ink2}>{cut(cur ? cur.title : 'ผ่อนคลายก่อนนอน', 20)}</text>,
    ], '14', '3');
  const nx = upcoming[0];
  return root([
    <text font="11,semibold" color={P.ink3}>{cur ? `ตอนนี้ · ถึง ${hm(cur.end)}` : 'ตอนนี้'}</text>,
    <text font="18,bold" color={P.ink}>{cut(cur ? cur.title : 'เวลาของคุณ', 22)}</text>,
    <spacer />,
    nx ? <text font="11,semibold" color={P.ink3}>{`ถัดไป ${hm(nx.b.start)}`}</text> : null,
    nx ? <text font="14,semibold" color={P.ink}>{cut(nx.b.title, 18)}</text> : null,
    <hstack spacing="4">
      <icon systemName="moon.fill" size="11" color={P.ink3} />
      <text font="11" color={P.ink2}>{`ปิดไฟ ${st.lightsOut}`}</text>
    </hstack>,
  ], '14', '3');
}

function medium() {
  if (asleep)
    return root([
      <hstack spacing="12" alignment="top">
        <vstack alignment="leading" spacing="4">
          <icon systemName="moon.zzz.fill" size="20" color={P.ink2} />
          <text font="20,bold" color={P.ink}>นอนหลับได้เลย</text>
          <text font="12" color={P.ink2}>ถ้าราว 20 นาทียังไม่หลับ ลุกไปนั่งที่แสงสลัว</text>
        </vstack>
        <spacer />
        {Card([<text font="11,semibold" color={P.ink3}>ตื่น</text>, <text font="22,bold,rounded" color={P.ink}>{st.wake}</text>], { bg: P.soft, pad: '10', r: '16' })}
      </hstack>,
    ]);
  if (winding)
    return root([
      <hstack spacing="12" alignment="top">
        <vstack alignment="leading" spacing="3">
          <text font="11,semibold" color={P.ink3}>ปิดไฟ</text>
          <text font="28,bold,rounded" color={P.ink}>{st.lightsOut}</text>
          <hstack spacing="4">
            <text font="13" color={P.ink2}>อีก</text>
            {Timer(lightsTs, '15,semibold,rounded')}
          </hstack>
        </vstack>
        <spacer />
        <vstack alignment="leading" spacing="5" padding="10" background={P.soft} corner="16" frame="170,max,topLeading">
          <text font="11,semibold" color={P.ink3}>ก่อนนอน</text>
          <text font="12" color={P.ink}>หรี่ไฟ · วางมือถือ</text>
          <text font="12" color={P.ink}>{bedtimeMeds ? `${hm(nextMeds[0].min)} ยาก่อนนอน` : 'ยาก่อนนอนตามที่หมอสั่ง'}</text>
          <text font="12" color={P.ink}>{`ตื่น ${st.wake}`}</text>
        </vstack>
      </hstack>,
    ]);
  const list = upcoming.slice(0, 3);
  return root([
    <hstack spacing="12" alignment="top">
      <vstack alignment="leading" spacing="4">
        <text font="11,semibold" color={P.ink3}>{cur ? `ตอนนี้ · ${hm(cur.start)}–${hm(cur.end)}` : 'ตอนนี้'}</text>
        <text font="19,bold" color={P.ink}>{cut(cur ? cur.title : 'เวลาของคุณ', 20)}</text>
        {cur && cur.sub ? <text font="12" color={P.ink2}>{cut(cur.sub, 38)}</text> : null}
        <spacer />
        <hstack spacing="4">
          <icon systemName="moon.fill" size="11" color={P.ink3} />
          <text font="11" color={P.ink2}>{`ปิดไฟ ${st.lightsOut} · อีก`}</text>
          {Timer(lightsTs, '11,semibold,rounded')}
        </hstack>
      </vstack>
      <vstack alignment="leading" spacing="6" padding="10" background={P.soft} corner="16" frame="150,max,topLeading">
        <text font="11,semibold" color={P.ink3}>ถัดไป</text>
        {list.map((e) => (
          <hstack spacing="6" alignment="top">
            <text font="12,semibold,rounded" color={P.ink} frame="38,max,leading">{hm(e.b.start)}</text>
            <text font="12" color={P.ink}>{cut(e.b.title, 14)}</text>
          </hstack>
        ))}
      </vstack>
    </hstack>,
  ]);
}

function large() {
  if (asleep) return root([Header(), SleepCard(false), NextCard(3, false, nowMin >= L ? 'พรุ่งนี้เช้า' : 'เช้านี้'), <spacer />]);
  if (winding) return root([Header(), WindCard(false), StepsCard(), <spacer />, NightChips()]);
  return root([Header(), NowCard(false), NextCard(3, false), <spacer />, DayChips()]);
}

function tall() {
  if (asleep) return root([Header(), SleepCard(true), NextCard(5, true, nowMin >= L ? 'พรุ่งนี้เช้า' : 'เช้านี้'), <spacer />, NightChips()], '16', '12');
  if (winding) return root([Header(), WindCard(true), StepsCard(), NextCard(3, false, 'พรุ่งนี้เช้า', tomorrowStart), <spacer />, NightChips()], '16', '12');
  return root([Header(), NowCard(true), NextCard(5, true, 'ต่อจากนี้'), <spacer />, DayChips()], '16', '12');
}

// Lock Screen: the system draws these in one tint, so no colors are set.
function inline() {
  return <text>{asleep ? `ตื่น ${st.wake}` : `ปิดไฟ ${st.lightsOut}`}</text>;
}

function rectangular() {
  const nx = upcoming[0];
  return (
    <vstack alignment="leading" spacing="1" frame="max,leading">
      <text font="14,bold">{asleep ? 'นอนหลับได้เลย' : cut(cur ? cur.title : 'เวลาของคุณ', 20)}</text>
      <text font="12">{asleep ? `ตื่น ${st.wake}` : nx ? `ถัดไป ${hm(nx.b.start)} ${cut(nx.b.title, 14)}` : ''}</text>
      <text font="12">{`ปิดไฟ ${st.lightsOut}`}</text>
    </vstack>
  );
}

function circular() {
  return (
    <vstack spacing="0" frame="max">
      <icon systemName={asleep ? 'moon.zzz.fill' : 'moon.fill'} size="14" />
      <text font="13,bold,rounded">{asleep ? st.wake : st.lightsOut}</text>
    </vstack>
  );
}

const view = {
  small,
  medium,
  large,
  extraLarge: large,
  extraLargePortrait: tall,
  accessoryInline: inline,
  accessoryRectangular: rectangular,
  accessoryCircular: circular,
}[size] || large;

$render(view());
