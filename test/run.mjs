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
seed['tasks/t2'] = { id: 't2', title: 'จองหมอผิวหนังเรื่อง microneedling', area: 'health', impact: 2, status: 'todo', createdAt: Date.now() - 86400000, estimateMin: 10 };
seed['tasks/t3'] = { id: 't3', title: 'สูตรโคชูจังให้รสคงที่', area: 'seoulful', impact: 3, status: 'waiting', waitingOn: 'เชฟนุ่น', followUpAt: Date.now() - 3600000, createdAt: Date.now() - 5 * 86400000 };
const months = {};
for (let i = 1; i <= 20; i++) {
  const d = new Date(now.getTime() - i * 86400000);
  const k = key(d);
  const m = k.slice(0, 7);
  months[m] ||= { month: m, days: {}, focus: {}, workouts: {}, breath: {} };
  months[m].days[k] = { checks: { 'lights-out': i % 3 ? Date.now() : null, water: Date.now() }, symptoms: { belch: 7 - (i % 5), heartburn: 2 + (i % 3) } };
  months[m].breath['b' + i] = { start: d.getTime(), minutes: 10 + (i % 4) * 5, preset: 'daily' };
  if (i % 2) months[m].workouts['w' + i] = { start: d.getTime(), end: d.getTime() + 2700000, program: 'A', exercises: { pushup: [{ reps: 12 + (i % 4), level: 3 }] } };
}
for (const [m, v] of Object.entries(months)) seed['logs/' + m] = v;
seed['digests/' + key(now)] = { date: key(now), items: { e1: { id: 'e1', kind: 'email', title: 'ใบแจ้งหนี้ซัพพลายเออร์ครบกำหนด', body: 'กิมจิ 12,400 บาท', source: 'Company inbox', priority: 'high' }, r1: { id: 'r1', kind: 'review', title: 'รีวิว Google Maps ใหม่ 5★', body: 'ต๊อกบกกีอร่อยมาก', source: 'Google Maps', rating: 5 }, n1: { id: 'n1', kind: 'news', title: 'SET แจ้งเตือน AKS เรื่องกรรมการตรวจสอบ', source: 'SET' } } };

const browser = await chromium.launch();
const problems = [];
async function openPage(scheme, width = 430, height = 932) {
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
  await page.addInitScript(`window.__SEED__ = ${JSON.stringify(seed)};\n${mock}`);
  await page.goto('https://artifact.test/');
  await page.waitForSelector('.tabbar');
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
await page.click('button:has-text("Add task")');
await page.waitForTimeout(300);
await check(page.evaluate(() => [...window.__docs.keys()].some((k) => k.startsWith('tasks/') && window.__docs.get(k).title.includes('ซัพพลายเออร์กิมจิ'))), 'new task saved to db');

// Tasks tab
await page.click('.tab:has-text("Tasks")');
await page.waitForTimeout(300);
await page.screenshot({ path: 'test/out/04-tasks.png', fullPage: true });
await noOverflow(page, 'tasks');
await page.click('.item:has-text("จองหมอผิวหนัง") .check');
await page.waitForTimeout(300);
await check(page.evaluate(() => window.__docs.get('tasks/t2')?.status === 'done'), 'completing a task marks it done');
await page.click('.seg button:has-text("Waiting")');
await page.waitForTimeout(200);
await page.click('.item:has-text("โคชูจัง")');
await page.waitForSelector('text=Waiting on เชฟนุ่น');
await page.click('button:has-text("Chased")');
await page.waitForTimeout(200);
await check(page.evaluate(() => (window.__docs.get('tasks/t3')?.followUps || 0) === 1), 'follow-up recorded');
await page.keyboard.press('Escape');

// Idea → steps
await page.click('.chip:has-text("Idea → steps")');
await page.fill('#tasks-composer', 'เพิ่มเมนูซุปกิมจิชีสหน้าฝน');
await page.click('.composer .icon-btn');
await page.waitForSelector('text=ทดลองสูตรซุปกิมจิชีส 2 แบบ');
await page.click('button:has-text("Add steps as tasks")');
await page.waitForTimeout(300);
await check(page.evaluate(() => [...window.__docs.values()].some((d) => d && d.title === 'ให้พนักงานชิมและให้คะแนน')), 'idea steps saved as tasks');

// Body: workout
await page.click('.tab:has-text("Body")');
await page.waitForTimeout(300);
await page.screenshot({ path: 'test/out/05-body-train.png', fullPage: true });
await noOverflow(page, 'body');
await page.click('.hero button:has-text("Start")');
await page.click('text=Warm-up done · start');
await page.click('button:has-text("Log set")');
await page.waitForSelector('text=Skip rest');
await page.screenshot({ path: 'test/out/06-workout-rest.png' });
await page.click('text=Skip rest');
await page.click('text=End workout');
await page.click('.chip:has-text("Solid")');
await page.click('button:has-text("Save workout")');
await page.waitForTimeout(300);
await check(page.evaluate(() => [...window.__docs.values()].some((d) => d && d.workouts && Object.values(d.workouts).some((w) => w.rpe === 8))), 'workout saved with sets');

// Breathe + Health
await page.click('.seg button:has-text("Breathe")');
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/out/07-breathe.png', fullPage: true });
await page.click('.hubtile:has-text("Belch SOS")');
await page.click('.sheet button:has-text("Start")');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'test/out/08-breath-run.png' });
await page.click('.sheet button:has-text("Finish")');
await page.keyboard.press('Escape');
await page.click('.seg button:has-text("Health")');
await page.waitForTimeout(300);
await page.screenshot({ path: 'test/out/09-health.png', fullPage: true });
await noOverflow(page, 'health');
await check(page.locator('text=Medicines today').isVisible(), 'health shows medicines');
await page.click('.item:has-text("Sleep")');
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/out/10-guide.png', fullPage: true });

// Hub pages
await page.click('.tab:has-text("Hub")');
await page.waitForTimeout(200);
await page.screenshot({ path: 'test/out/11-hub.png', fullPage: true });
for (const name of ['Seoulful', 'Markets', 'Inbox', 'Laundry', 'Shopping', 'Stats', 'Ask Claude', 'Hairline', 'Alarm & sleep', 'Settings']) {
  await page.click(`.hubtile:has-text("${name}")`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test/out/hub-${name.replace(/[^a-z]/gi, '').toLowerCase()}.png`, fullPage: true });
  await noOverflow(page, 'hub ' + name);
  if (name === 'Markets') {
    const txt = await page.locator('.screen').last().innerText();
    await check(txt.includes('09:40–09:55') && !txt.includes('09:25'), 'markets routine follows the schedule');
  }
  if (name === 'Laundry') {
    const btn = page.locator('.screen button.btn.primary:has-text("Start")');
    if (await btn.isDisabled()) await page.click('.item:has-text("Towels & bedding") .check');
    await btn.click();
    await page.waitForTimeout(200);
    await check(page.evaluate(() => [...window.__docs.values()].some((d) => d && d.flow && d.flow.id === 'laundry')), 'laundry flow created');
  }
  if (name === 'Settings') {
    await page.fill('#set-wake', '09:15');
    await page.dispatchEvent('#set-wake', 'change');
    await page.waitForTimeout(200);
    await check(page.evaluate(() => window.__docs.get('cfg/settings')?.wake === '09:15'), 'settings saved');
    await page.click('button:has-text("Save backup file")');
    await page.waitForTimeout(200);
    await check(page.evaluate(() => window.__downloads.length === 1), 'backup offered as a download');
  }
  await page.click('.icon-btn[aria-label="Back"]');
  await page.waitForTimeout(150);
}

// light theme and small phone
const light = await openPage('light', 390, 844);
await light.page.screenshot({ path: 'test/out/20-today-light.png', fullPage: true });
await noOverflow(light.page, 'today light 390');

await browser.close();
console.log('\n' + (problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'ALL CHECKS PASSED'));
process.exit(problems.length ? 1 : 0);
