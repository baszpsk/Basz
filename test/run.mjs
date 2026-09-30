// End-to-end checks in Chromium at iPhone size with a mocked Claude runtime.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

execSync('node build.mjs', { stdio: 'inherit' });
const html = readFileSync('dist/basz-os.html', 'utf8');
const mock = readFileSync('test/mock-claude.js', 'utf8');
mkdirSync('test/out', { recursive: true });

const skeleton = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;

// ---- seed ----
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const seed = {};
let plan = null;
let shop = [];
if (existsSync('seed/private/plan.mjs')) ({ plan, shop } = await import('../seed/private/plan.mjs'));
if (plan) seed['cfg/plan'] = plan;
for (const s of shop) seed['shop/' + s.id] = s;
seed['tasks/t1'] = { id: 't1', title: 'ตรวจสต็อกกิมจิและสั่งของ', area: 'seoulful', impact: 3, status: 'todo', createdAt: Date.now() - 3 * 86400000, due: key(now), estimateMin: 25 };
seed['tasks/t2'] = { id: 't2', title: 'จองช่างล้างแอร์', area: 'home', impact: 2, status: 'todo', createdAt: Date.now() - 86400000, estimateMin: 10 };
seed['tasks/t3'] = { id: 't3', title: 'สูตรโคชูจังให้รสคงที่', area: 'seoulful', impact: 3, status: 'waiting', waitingOn: 'เชฟนุ่น', followUpAt: Date.now() - 3600000, createdAt: Date.now() - 5 * 86400000 };
const months = {};
for (let i = 1; i <= 20; i++) {
  const d = new Date(now.getTime() - i * 86400000);
  const k = key(d);
  const m = k.slice(0, 7);
  months[m] ||= { month: m, days: {}, focus: {}, workouts: {}, breath: {} };
  months[m].days[k] = { checks: { 'lights-out': i % 3 ? Date.now() : null, water: Date.now() } };
  months[m].breath['b' + i] = { start: d.getTime(), minutes: 10 + (i % 4) * 5, preset: 'daily' };
  if (i % 2) months[m].workouts['w' + i] = { start: d.getTime(), end: d.getTime() + 2700000, program: 'A', exercises: { pushup: [{ reps: 12 + (i % 4), level: 3 }] } };
}
// รอบโฟกัสย้อนหลัง 40 วัน ให้หน้าสถิติมีหลายสัปดาห์ไว้เทียบ (วันละ 0–6 รอบ บางรอบหยุดก่อนครบ มีพักหลังทุกรอบ)
let seedRounds = 0;
const seedFull = {};
for (let i = 1; i <= 40; i++) {
  const d = new Date(now.getTime() - i * 86400000);
  d.setHours(10, 0, 0, 0);
  const k = key(d);
  const m = k.slice(0, 7);
  months[m] ||= { month: m, days: {}, focus: {}, workouts: {}, breath: {} };
  const n = [0, 2, 4, 6, 3, 5, 1][i % 7];
  for (let j = 0; j < n; j++) {
    const start = d.getTime() + j * 1800000;
    const cut = j === 2 && i % 5 === 0;
    const active = cut ? 900 : 1500;
    months[m].focus['w' + start] = { start, end: start + active * 1000, minutes: active / 60, kind: 'work', plannedSec: 1500, activeSec: active, completed: !cut, endedBy: cut ? 'stop' : 'timer', pauses: [], pausedSec: 0 };
    months[m].focus['b' + (start + 1500000)] = { start: start + 1500000, end: start + 1800000, minutes: 5, kind: 'break', plannedSec: 300, activeSec: 300, completed: true, endedBy: 'timer', pauses: [], pausedSec: 0 };
    seedRounds += 2;
    if (!cut) seedFull[k] = (seedFull[k] || 0) + 1;
  }
}
for (const [m, v] of Object.entries(months)) seed['logs/' + m] = v;
seed['digests/' + key(now)] = { date: key(now), items: { e1: { id: 'e1', kind: 'email', title: 'ใบแจ้งหนี้ซัพพลายเออร์ครบกำหนด', body: 'กิมจิ 12,400 บาท', source: 'Company inbox', priority: 'high' }, r1: { id: 'r1', kind: 'review', title: 'รีวิว Google Maps ใหม่ 5★', body: 'ต๊อกบกกีอร่อยมาก', source: 'Google Maps', rating: 5 }, n1: { id: 'n1', kind: 'news', title: 'SET แจ้งเตือน AKS เรื่องกรรมการตรวจสอบ', source: 'SET' } } };

const browser = await chromium.launch();
const problems = [];
async function openPage(scheme, width = 430, height = 932, noDb = false, clock = false) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(`[console ${scheme}] ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`[pageerror ${scheme}] ${e.message}`));
  await page.route('https://cdn.jsdelivr.net/npm/preact@*/**', (route) => {
    const u = route.request().url();
    const file = u.includes('/hooks/') ? 'node_modules/preact/hooks/dist/hooks.umd.js' : 'node_modules/preact/dist/preact.umd.js';
    route.fulfill({ contentType: 'application/javascript', body: readFileSync(file) });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.route('https://artifact.test/**', (r) => r.fulfill({ contentType: 'text/html', body: skeleton(html) }));
  await page.addInitScript(`window.__NO_DB__ = ${noDb};\nwindow.__SEED__ = ${JSON.stringify(seed)};\n${mock}`);
  if (clock) await page.clock.install();
  await page.goto('https://artifact.test/');
  await page.waitForSelector(noDb ? '#no-storage' : '.tabbar');
  await page.waitForTimeout(400);
  return { ctx, page };
}
const check = async (cond, msg) => { if (!(await cond)) problems.push('FAIL: ' + msg); else console.log('ok -', msg); };
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await check(o <= 0, `${label}: no horizontal scroll (overflow ${o}px)`);
};

const { page } = await openPage('dark');
await page.screenshot({ path: 'test/out/01-today-dark.png', fullPage: true });
await noOverflow(page, 'today');
await check(page.locator('.hero').first().isVisible(), 'Now card renders');

// tick a routine item in the hero or the timeline
const firstCheck = page.locator('.hero .check').first();
if (await firstCheck.count()) {
  await firstCheck.click();
  await page.waitForTimeout(300);
  await check(page.evaluate(() => window.__writes.some(([op, p]) => p.startsWith('logs/'))), 'checking a routine item writes to logs');
}

// add a task with Claude parsing and a follow-up question
await page.fill('#today-composer', 'โทรหาซัพพลายเออร์กิมจิเรื่องราคา');
await page.keyboard.press('Enter');
await page.waitForSelector('text=ต้องได้คำตอบภายในวันไหน?');
await page.screenshot({ path: 'test/out/02-add-question.png' });
await page.click('.sheet .chip:has-text("พรุ่งนี้")');
await page.waitForFunction(() => !document.body.textContent.includes('ต้องได้คำตอบภายในวันไหน?'));
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/out/03-add-ready.png' });
await page.click('.sheet button:has-text("เพิ่มงาน")');
await page.waitForTimeout(300);
await check(page.evaluate(() => [...window.__docs.keys()].some((k) => k.startsWith('tasks/') && window.__docs.get(k).title.includes('ซัพพลายเออร์กิมจิ'))), 'new task saved to db');

// no daily check-in: nothing asks for ratings or counts
await check(page.evaluate(() => !document.body.textContent.includes('เช็คอิน')), 'today has no check-in');
await check(page.locator('.tile:has-text("ปิดไฟตรงเวลา")').count().then((n) => n === 1), 'today tile shows lights-out on time');

// Tasks tab
await page.click('.tab:has-text("งาน")');
await page.waitForTimeout(300);
await page.screenshot({ path: 'test/out/04-tasks.png', fullPage: true });
await noOverflow(page, 'tasks');
await page.click('.item:has-text("จองช่างล้างแอร์") .check');
await page.waitForTimeout(300);
await check(page.evaluate(() => window.__docs.get('tasks/t2')?.status === 'done'), 'completing a task marks it done');
await page.click('.seg button:has-text("รอคนอื่น")');
await page.waitForTimeout(200);
await page.click('.item:has-text("โคชูจัง")');
await page.waitForSelector('text=รอ เชฟนุ่น');
await page.click('button:has-text("ตามแล้ว")');
await page.waitForTimeout(200);
await check(page.evaluate(() => (window.__docs.get('tasks/t3')?.followUps || 0) === 1), 'follow-up recorded');
await page.keyboard.press('Escape');

// Idea → steps
await page.click('.chip:has-text("ไอเดีย → ขั้นตอน")');
await page.fill('#tasks-composer', 'เพิ่มเมนูซุปกิมจิชีสหน้าฝน');
await page.click('.composer .icon-btn');
await page.waitForSelector('text=ทดลองสูตรซุปกิมจิชีส 2 แบบ');
await page.click('button:has-text("เพิ่มขั้นตอนเป็นงาน")');
await page.waitForTimeout(300);
await check(page.evaluate(() => [...window.__docs.values()].some((d) => d && d.title === 'ให้พนักงานชิมและให้คะแนน')), 'idea steps saved as tasks');

// Body: workout
await page.click('.tab:has-text("ร่างกาย")');
await page.waitForTimeout(300);
await page.screenshot({ path: 'test/out/05-body-train.png', fullPage: true });
await noOverflow(page, 'body');
await page.click('.hero button:has-text("เริ่ม")');
await page.click('text=วอร์มอัพเสร็จ · เริ่ม');
await page.click('button:has-text("บันทึกเซ็ต")');
await page.waitForSelector('text=ข้ามการพัก');
await page.screenshot({ path: 'test/out/06-workout-rest.png' });
await page.click('text=ข้ามการพัก');
await page.click('text=จบการออกกำลังกาย');
await page.click('.chip:has-text("หนักพอดี")');
await page.click('button:has-text("บันทึกการออกกำลังกาย")');
await page.waitForTimeout(300);
await check(page.evaluate(() => [...window.__docs.values()].some((d) => d && d.workouts && Object.values(d.workouts).some((w) => w.rpe === 8))), 'workout saved with sets');

// Breathe + Health
await page.click('.seg button:has-text("หายใจ")');
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/out/07-breathe.png', fullPage: true });
await page.click('.hubtile:has-text("ตอนจะเรอ")');
await page.click('.sheet button:has-text("เริ่ม")');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'test/out/08-breath-run.png' });
await page.click('.sheet button:has-text("เสร็จ")');
await page.keyboard.press('Escape');
await page.click('.seg button:has-text("สุขภาพ")');
await page.waitForTimeout(300);
await page.screenshot({ path: 'test/out/09-health.png', fullPage: true });
await noOverflow(page, 'health');
await check(page.locator('text=ยาวันนี้').first().isVisible(), 'health shows medicines');
await page.click('.item:has-text("การนอน")');
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/out/10-guide.png', fullPage: true });

// Hub pages
await page.click('.tab:has-text("เมนู")');
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/out/11-hub.png', fullPage: true });
const HUB = [['seoulful', 'Seoulful'], ['markets', 'หุ้น'], ['inbox', 'แจ้งเตือน'], ['laundry', 'ซักผ้า'], ['shopping', 'ของที่ต้องซื้อ'], ['progress', 'สถิติ'], ['askclaude', 'ถาม Claude'], ['hairline', 'ไรผม'], ['alarm', 'ปลุกและการนอน'], ['settings', 'ตั้งค่า']];
for (const [name, label] of HUB) {
  await page.click(`.hubtile:has(.h3:text-is("${label}"))`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test/out/hub-${name}.png`, fullPage: true });
  await noOverflow(page, 'hub ' + name);
  if (name === 'progress') {
    const txt = await page.locator('.screen').last().innerText();
    await check(txt.includes('วิดพื้นเซ็ตที่ดีที่สุด') && txt.includes('กินยาครบ') && !/คุณภาพการนอน|พลังงาน|ยาลดกรดที่กินเพิ่ม|\/10|\/5/.test(txt) && /เทียบ(เมื่อวาน|วันก่อนหน้า| \d)/.test(txt), 'progress compares metrics with their last value');
    await check(!/\bXP\b|Level \d|เลเวล/.test(txt), 'progress has no XP or levels');
    await page.click('.item:has-text("วิดพื้นเซ็ตที่ดีที่สุด")');
    await page.waitForTimeout(300);
    const sheet = await page.locator('.sheet').innerText();
    await check(sheet.includes('ดีที่สุดตลอดกาล') && sheet.includes('7 วันล่าสุด เทียบ 7 วันก่อนหน้า'), 'metric sheet shows averages and all-time best');
    await page.click('.sheet button[aria-label="ปิด"]');
    await page.waitForTimeout(200);    // เลือกสัปดาห์: ตัวชี้วัดรวมตามช่วงและเทียบกับสัปดาห์ก่อนหน้า แล้วเปิดกราฟของตัวหนึ่ง
    await page.click('#progress-range button:text-is("สัปดาห์")');
    await page.waitForTimeout(300);
    const wt = await page.locator('.screen').last().innerText();
    await check(wt.includes('เทียบสัปดาห์ก่อนหน้า') && wt.includes('คืนที่ปิดไฟตรงเวลา') && wt.includes('รวมทั้งช่วง') && wt.includes('Pomodoro ที่ครบ'), 'สถิติรวมเลือกสัปดาห์ได้และเทียบกับสัปดาห์ก่อนหน้า');
    await page.screenshot({ path: 'test/out/36-progress-week.png', fullPage: true });
    await noOverflow(page, 'progress week');
    await page.click('.item:has-text("Pomodoro ที่ครบ")');
    await page.waitForTimeout(300);
    const ps = await page.locator('.sheet').innerText();
    await check(ps.includes('ดีที่สุดตลอดกาล (ต่อวัน)') && ps.includes('สัปดาห์นี้'), 'กราฟของตัวชี้วัดแสดงตามช่วงที่เลือก');
    await page.screenshot({ path: 'test/out/37-progress-week-sheet.png' });
    await page.click('.sheet button[aria-label="ปิด"]');
    await page.waitForTimeout(200);
    await page.click('#progress-range button:text-is("ปี")');
    await page.waitForTimeout(300);
    await noOverflow(page, 'progress year');
    await page.click('#progress-range button:text-is("วัน")');
    await page.waitForTimeout(200);
  }
  if (name === 'markets') {
    const txt = await page.locator('.screen').last().innerText();
    await check(txt.includes('09:40–09:55') && !txt.includes('09:25'), 'markets routine follows the schedule');
  }
  if (name === 'laundry') {
    const btn = page.locator('.screen button.btn.primary:has-text("เริ่มซัก")');
    if (await btn.isDisabled()) await page.click('.item:has-text("ผ้าเช็ดตัวและเครื่องนอน") .check');
    await btn.click();
    await page.waitForTimeout(200);
    await check(page.evaluate(() => [...window.__docs.values()].some((d) => d && d.flow && d.flow.id === 'laundry')), 'laundry flow created');
  }
  if (name === 'settings') {
    await page.fill('#set-wake', '09:15');
    await page.dispatchEvent('#set-wake', 'change');
    await page.waitForTimeout(200);
    await check(page.evaluate(() => window.__docs.get('cfg/settings')?.wake === '09:15'), 'settings saved');
    await page.click('button:has-text("บันทึกไฟล์สำรอง")');
    await page.waitForTimeout(200);
    await check(page.evaluate(() => window.__downloads.length === 1), 'backup offered as a download');
  }
  await page.click('.icon-btn[aria-label="กลับ"]');
  await page.waitForTimeout(150);
}

// Pomodoro 25/5 with a controllable clock: a full round with one pause, the rest, then an early stop
{
  const { page: pp } = await openPage('light', 390, 844, false, true);
  const pomo = () => pp.evaluate(() => window.__docs.get('cfg/meta')?.pomo || null);
  const rounds = () => pp.evaluate(() => [...window.__docs.entries()].filter(([k]) => k.startsWith('logs/')).flatMap(([, v]) => Object.entries(v.focus || {}).map(([id, f]) => ({ id, ...f }))));
  await pp.click('.screen .chip:has-text("โฟกัส 25/5")');
  await pp.waitForSelector('#pomo-start');
  await pp.screenshot({ path: 'test/out/30-pomodoro-idle.png' });
  await pp.click('#pomo-start');
  await pp.waitForTimeout(300);
  await check(pomo().then((p) => p?.phase === 'work' && p.running && p.plannedSec === 1500), 'pomodoro starts a 25-minute focus round');
  await pp.clock.fastForward('05:00');
  await pp.click('#pomo-pause');
  await pp.waitForTimeout(200);
  await check(pomo().then((p) => p && !p.running && p.pauses.length === 1), 'pause is recorded');
  await pp.clock.fastForward('02:00');
  await pp.click('#pomo-resume');
  await pp.waitForTimeout(200);
  await pp.screenshot({ path: 'test/out/31-pomodoro-running.png' });
  await pp.clock.fastForward('20:30');
  await pp.waitForTimeout(300);
  await check(rounds().then((r) => r.some((x) => x.kind === 'work' && x.completed === true && x.activeSec === 1500 && x.pauses?.length === 1 && x.pausedSec === 120 && x.endedBy === 'timer')), 'a full round is logged with counted time, pauses and how it ended');
  await check(pomo().then((p) => p?.phase === 'break' && p.running && p.plannedSec === 300), 'the 5-minute rest starts by itself');
  await pp.clock.fastForward('05:00');
  await pp.waitForTimeout(300);
  await check(rounds().then((r) => r.some((x) => x.kind === 'break' && x.completed === true && x.activeSec === 300)), 'the full rest is logged');
  await check(pomo().then((p) => p?.phase === 'idle'), 'after the rest the timer waits for the next start');
  await pp.click('#pomo-start');
  await pp.clock.fastForward('03:00');
  await pp.click('#pomo-stop');
  await pp.click('#pomo-stop');
  await pp.waitForTimeout(300);
  await check(rounds().then((r) => r.some((x) => x.kind === 'work' && x.completed === false && x.endedBy === 'stop' && x.activeSec >= 179 && x.activeSec <= 181)), 'an early stop is logged as not full');
  // พักได้ทันทีจากตอนว่าง ไม่ต้องรอโฟกัสครบ
  await pp.click('#pomo-break');
  await pp.waitForTimeout(200);
  await check(pomo().then((p) => p?.phase === 'break' && p.running && p.plannedSec === 300), 'กดพัก 5 นาทีจากตอนว่างได้ทันที');
  await pp.clock.fastForward('05:00');
  await pp.waitForTimeout(300);
  await check(pomo().then((p) => p?.phase === 'idle'), 'พักที่เริ่มจากตอนว่างจบแล้วกลับไปรอ');
  // ตัดโฟกัสกลางรอบเพื่อพักเลย ต้องแตะสองครั้ง รอบโฟกัสบันทึกว่าหยุดเพื่อพัก
  await pp.click('#pomo-start');
  await pp.clock.fastForward('10:00');
  await pp.click('#pomo-break');
  await pp.waitForTimeout(200);
  await check(pomo().then((p) => p?.phase === 'work'), 'ตัดโฟกัสเพื่อพักต้องแตะยืนยันอีกครั้ง');
  await pp.screenshot({ path: 'test/out/33-pomodoro-break-confirm.png' });
  await pp.click('#pomo-break');
  await pp.waitForTimeout(300);
  await check(rounds().then((r) => r.some((x) => x.kind === 'work' && x.completed === false && x.endedBy === 'break' && x.activeSec >= 599 && x.activeSec <= 601)), 'รอบโฟกัสที่ตัดไปพักบันทึกว่าหยุดเพื่อพัก');
  await check(pomo().then((p) => p?.phase === 'break' && p.running && p.plannedSec === 300), 'พัก 5 นาทีเริ่มทันทีหลังตัดโฟกัส');
  await pp.click('#pomo-stop');
  await pp.waitForTimeout(200);
  await pp.click('.sheet button[aria-label="ปิด"]');
  await pp.waitForTimeout(300);
  await pp.click('.tab:has-text("เมนู")');
  await pp.click('.hubtile:has(.h3:text-is("โฟกัส 25/5"))');
  await pp.waitForTimeout(400);
  await pp.screenshot({ path: 'test/out/32-pomodoro-stats.png', fullPage: true });
  await noOverflow(pp, 'pomodoro stats');
  const txt = await pp.locator('.screen').last().innerText();
  await check(txt.includes('บันทึกทุกรอบ') && txt.includes('หยุดก่อนครบ') && txt.includes('หยุดเพื่อพัก') && txt.includes('คุณภาพการโฟกัส'), 'stats page shows the log and quality');
  await pp.click('button:has-text("ดาวน์โหลดทุกรอบ")');
  await pp.waitForTimeout(300);
  await check(pp.evaluate((extra) => { const d = Object.values(window.__downloadData || {})[0] || ''; return d.split('\r\n').length === 7 + extra && d.includes('กดจบก่อน') && d.includes('หยุดเพื่อพัก') && d.includes('ครบเวลา'); }, seedRounds), 'CSV export holds every round');
  // ช่วงเวลา: เริ่มที่สัปดาห์ แล้วลองทั้งหมด เดือน ย้อนเดือนก่อน และกำหนดเอง
  const kpi = () => pp.locator('.kpi .v').first().innerText().then((t) => t.trim());
  const addK = (k, n) => { const [y, mo, d] = k.split('-').map(Number); return key(new Date(y, mo - 1, d + n, 12)); };
  await check(pp.locator('#focus-range button.on').innerText().then((t) => t.trim() === 'สัปดาห์'), 'หน้าสถิติโฟกัสเริ่มที่สัปดาห์นี้');
  await pp.click('#focus-range button:text-is("ทั้งหมด")');
  await pp.waitForTimeout(300);
  const allFull = Object.values(seedFull).reduce((a, b) => a + b, 0) + 1;
  await check(kpi().then((t) => t === `${allFull} รอบ`), 'ช่วงทั้งหมดนับรอบที่ครบตรงกับบันทึก');
  await pp.click('#focus-range button:text-is("เดือน")');
  await pp.waitForTimeout(300);
  await pp.screenshot({ path: 'test/out/34-focus-month.png', fullPage: true });
  await noOverflow(pp, 'focus month');
  await check(pp.locator('.screen').last().innerText().then((t) => t.includes('เดือนนี้') && t.includes('เทียบเดือนก่อนหน้า')), 'เดือนนี้เทียบกับเดือนก่อนหน้า');
  await pp.click('button[aria-label="ช่วงก่อนหน้า"]');
  await pp.waitForTimeout(300);
  await check(pp.locator('.rangenav .h3').innerText().then((t) => t.trim() !== 'เดือนนี้'), 'ย้อนไปดูเดือนก่อนได้');
  await pp.click('#focus-range button:text-is("กำหนดเอง")');
  await pp.waitForTimeout(300);
  const todayK = await pp.getAttribute('#focus-range-to', 'max');
  await pp.fill('#focus-range-from', addK(todayK, -6));
  await pp.fill('#focus-range-to', todayK);
  await pp.waitForTimeout(300);
  let want = 1;
  for (let i = 1; i <= 6; i++) want += seedFull[addK(todayK, -i)] || 0;
  await check(kpi().then((t) => t === `${want} รอบ`), 'กำหนดช่วง 7 วันเองได้ และนับรอบตรง');
  await pp.screenshot({ path: 'test/out/35-focus-custom.png' });
  await noOverflow(pp, 'focus custom');
  // พักยาว: ครบชุด 4 รอบแล้วพัก 15 นาทีเอง พร้อมคำแนะนำระหว่างพัก จบแล้วเริ่มนับชุดใหม่
  await pp.click('.hero .btn.primary');
  await pp.waitForSelector('#pomo-start');
  for (let i = 0; i < 4; i++) {
    await pp.click('#pomo-start');
    await pp.clock.fastForward('25:01');
    await pp.waitForTimeout(300);
    const cur = await pomo();
    if (cur?.phase === 'break' && cur.long) break;
    await pp.clock.fastForward('05:01');
    await pp.waitForTimeout(300);
  }
  await check(pomo().then((x) => x?.phase === 'break' && x.long === true && x.plannedSec === 900), 'ครบชุด 4 รอบแล้วได้พักยาว 15 นาทีเอง');
  await check(pp.locator('#pomo-tips').isVisible(), 'ระหว่างพักมีคำแนะนำให้ลุกจากจอ');
  await pp.screenshot({ path: 'test/out/38-pomodoro-long-break.png' });
  await pp.clock.fastForward('15:01');
  await pp.waitForTimeout(300);
  await check(rounds().then((r) => r.some((x) => x.kind === 'break' && x.long === true && x.activeSec === 900)), 'พักยาวบันทึกไว้ครบ');
  await check(pomo().then((x) => x?.phase === 'idle' && (x.set || 0) === 0), 'หลังพักยาวเริ่มนับชุดใหม่');
  await pp.click('.sheet button[aria-label="ปิด"]');
  await pp.waitForTimeout(200);
}

// light theme and small phone
const light = await openPage('light', 390, 844);
await light.page.screenshot({ path: 'test/out/20-today-light.png', fullPage: true });
await noOverflow(light.page, 'today light 390');

// a viewer without artifact storage explains itself instead of showing an empty app
const bare = await openPage('light', 390, 844, true);
await check(bare.page.locator('#no-storage').isVisible(), 'no-storage viewer shows the open-from-icon screen');
await check(bare.page.locator('.tabbar').count().then((n) => n === 0), 'no-storage viewer hides the app');

await browser.close();
console.log('\n' + (problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'ALL CHECKS PASSED'));
process.exit(problems.length ? 1 : 0);
