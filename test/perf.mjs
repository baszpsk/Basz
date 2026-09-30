// วัดความหน่วงตอนแตะในจุดต่างๆ ของแอป (Chromium ขนาด iPhone, CPU ช้าลง 4 เท่า) ใช้ไฟล์ใน dist ที่สร้างแล้ว
// npm run perf หรือ node test/perf.mjs [base|noloop|noanim|noblur|all]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';


const html = readFileSync('dist/basz-os.html', 'utf8');
const mock = readFileSync('test/mock-claude.js', 'utf8');


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


// ---- วัดความหน่วงตอนแตะ ----
const TAPS = [
  ['ปฏิทิน: วันถัดไป', "document.querySelector('#calendar .calday.today + .calday')"],
  ['ปฏิทิน: ดูทั้งเดือน', "document.querySelector('#cal-view')"],
  ['ปฏิทิน: ดูสัปดาห์', "document.querySelector('#cal-view')"],
  ['ปฏิทิน: กลับวันนี้', "[...document.querySelectorAll('#calendar .chip')].find((b) => b.textContent.trim() === 'วันนี้')"],
  ['ปฏิทิน: เปิดเลื่อนวัน', "document.querySelector('#calendar button[aria-label^=\"เลื่อนวัน\"]')"],
  ['เลื่อนไปพรุ่งนี้ (บันทึก)', "document.querySelector('#move-tomorrow')"],
  ['ติ๊กกิจวัตร', "document.querySelector('.hero .check')"],
  ['แท็บงาน', "document.querySelector('[data-tab=tasks]')"],
  ['แท็บร่างกาย', "document.querySelector('[data-tab=body]')"],
  ['แท็บเมนู', "document.querySelector('[data-tab=hub]')"],
  ['เปิดหน้าสถิติ', "[...document.querySelectorAll('.hubtile')].find((b) => b.querySelector('.h3')?.textContent.trim() === 'สถิติ')"],
  ['กลับ', "document.querySelector('.icon-btn[aria-label=\"กลับ\"]')"],
  ['แท็บวันนี้', "document.querySelector('[data-tab=today]')"],
];
const metric = (m, n) => m.metrics.find((x) => x.name === n)?.value || 0;
async function run(label, css) {
  const { page, ctx } = await openPage('light', 390, 844);
  if (css) await page.addStyleTag({ content: css });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); let n = 0; const f = (now) => { t.push(now - last); last = now; if (++n < 120) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }));
  const fs = frames.slice(2).sort((a, b) => a - b);
  const rows = [];
  for (const [name, finder] of TAPS) {
    const before = await cdp.send('Performance.getMetrics');
    const ms = await page.evaluate(async (finder) => {
      const el = eval(finder);
      if (!el) return null;
      const t0 = performance.now();
      el.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const first = performance.now() - t0;
      // เวลาที่เหลือจนแอนิเมชันที่มีจุดจบเล่นจบทั้งหมด (ความรู้สึกว่าหน้าจอ "นิ่ง" แล้ว)
      // นับเฉพาะที่ทำให้ต้องรอ: การ์ดเข้าหน้า หน้าต่างเลื่อนขึ้น พื้นหลังจาง และทรานซิชันของปุ่ม ไม่นับแอนิเมชันตกแต่ง
      const WAIT = new Set(['rise', 'sheetIn', 'fade']);
      let slow = 0;
      let who = '';
      for (const a of document.getAnimations()) {
        if (a.animationName && !WAIT.has(a.animationName)) continue;
        const c = a.effect?.getComputedTiming?.();
        if (!c || !Number.isFinite(c.endTime)) continue;
        const rest = c.endTime - (c.localTime ?? 0);
        if (rest > slow) { slow = rest; who = a.animationName || a.transitionProperty || ''; }
      }
      return [first, first + slow, who];
    }, finder);
    const after = await cdp.send('Performance.getMetrics');
    const d = (n) => Math.round((metric(after, n) - metric(before, n)) * 1000);
    rows.push([name, ms == null ? 'ไม่พบปุ่ม' : Math.round(ms[0]), ms == null ? '-' : `${Math.round(ms[1])} (${ms[2] || '-'})`, d('ScriptDuration'), d('RecalcStyleDuration'), d('LayoutDuration')]);
    await page.waitForTimeout(1200);
  }
  await ctx.close();
  console.log(`\n=== ${label} === เฟรมตอนอยู่นิ่ง: กลาง ${fs[fs.length >> 1].toFixed(1)}ms · ช้าสุด 10% ${fs[Math.floor(fs.length * 0.9)].toFixed(1)}ms`);
  console.log('การแตะ | ถึงเฟรมแรก | ถึงแอนิเมชันจบ | สคริปต์ | คำนวณสไตล์ | จัดวาง (ms)');
  for (const r of rows) console.log(r.join(' | '));
}
const mode = process.argv[2] || 'all';
if (mode === 'all' || mode === 'base') await run('ปกติ (CPU ช้าลง 4 เท่า)');
if (mode === 'all' || mode === 'noloop') await run('ปิดแอนิเมชันที่วนไม่หยุด', '.sky i, .hero::before, .hero .glow, .tl.now::before, .icon-btn .dot, [class] { animation-iteration-count: 1 !important; } .sky i { animation: none !important; }');
if (mode === 'all' || mode === 'noanim') await run('ปิดแอนิเมชันและทรานซิชันทั้งหมด', '*, *::before, *::after { animation: none !important; transition: none !important; }');
if (mode === 'all' || mode === 'noblur') await run('ปิดกระจกเบลอทั้งหมด', '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }');
await browser.close();
