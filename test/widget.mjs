// Runs the Home Screen widget the way ScriptWidget does (JSX with the
// ScriptWidget.createElement factory, wrapped in an async $main) for every
// size, every 20 minutes over several days, and checks the runtime contract.
process.env.TZ = 'Asia/Bangkok';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

execFileSync('node', ['widget/build.mjs'], { stdio: 'inherit' });
const src = readFileSync('dist/widget/Basz OS/main.jsx', 'utf8');
const js = transformSync('async function $main() { try {' + src + '} catch (e) { $error(String(e && e.stack || e)); } }', {
  loader: 'jsx',
  jsxFactory: 'ScriptWidget.createElement',
  jsxFragment: 'ScriptWidget.Fragment',
}).code;
const shim = `class ScriptWidget { static createElement(tag, props, ...children) { return $element.createElement(tag, props, children); } }
ScriptWidget.Fragment = 'Fragment';
function $gradient(obj) { return 'gradient:' + JSON.stringify(obj); }`;

const SIZES = ['small', 'medium', 'large', 'extraLargePortrait', 'accessoryInline', 'accessoryRectangular', 'accessoryCircular'];
const STRING_PROPS = ['padding', 'frame', 'font', 'color', 'background', 'shadow', 'alignment', 'linkurl', 'systemName', 'style', 'trackColor', 'spacing', 'corner', 'thickness', 'size'];
const TAGS = new Set(['vstack', 'hstack', 'zstack', 'text', 'date', 'spacer', 'circle', 'icon', 'progress']);
const flat = (list) => (list || []).flatMap((c) => (Array.isArray(c) ? flat(c) : c && typeof c === 'object' && c.tag ? [c] : []));

async function run(ms, size, param = '') {
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(ms); }
    static now() { return ms; }
  }
  let root = null;
  let err = null;
  const ctx = vm.createContext({
    Date: FakeDate,
    console,
    $getenv: (k) => ({ 'widget-size': size, 'widget-param': param, 'widget-rendering-mode': 'fullColor' })[k] || '',
    $element: { createElement: (tag, props, children) => ({ tag, props: props || {}, children }) },
    $render: (el) => { root = el; },
    $error: (e) => { err = e; },
  });
  vm.runInContext(shim, ctx);
  vm.runInContext(js, ctx);
  await ctx.$main();
  return { root, err };
}

function contract(root) {
  const out = [];
  let count = 0;
  const texts = [];
  const visit = (n, depth) => {
    count++;
    if (depth > 64) out.push('deeper than 64');
    if (!TAGS.has(n.tag)) out.push(`unknown tag ${n.tag}`);
    for (const [k, v] of Object.entries(n.props)) {
      if (v === undefined || v === null) continue;
      if (STRING_PROPS.includes(k) && typeof v !== 'string') out.push(`${n.tag}.${k} is ${typeof v}, not a string`);
    }
    if (n.tag === 'date' && typeof n.props.date !== 'number') out.push('date without a numeric timestamp');
    if (n.tag === 'text') {
      for (const c of n.children || []) if (typeof c !== 'string' && typeof c !== 'number') out.push(`text child is ${c === null ? 'null' : typeof c}`);
      texts.push((n.children || []).join(''));
    } else flat(n.children).forEach((c) => visit(c, depth + 1));
  };
  visit(root, 1);
  if (count > 1000) out.push(`${count} nodes (limit 1000)`);
  for (const t of texts) if (/undefined|NaN|\[object/.test(t)) out.push(`bad text: ${t}`);
  return out;
}

const problems = new Set();
let runs = 0;
const start = new Date('2026-09-27T06:00:00+07:00').getTime(); // Sunday, then Monday–Wednesday
for (let t = start; t < start + 4 * 86400000; t += 20 * 60000) {
  for (const size of SIZES) {
    const { root, err } = await run(t, size);
    runs++;
    const at = new Date(t).toString().slice(0, 21);
    if (err) problems.add(`${size} ${at}: ${err}`);
    else if (!root) problems.add(`${size} ${at}: nothing rendered`);
    else for (const p of contract(root)) problems.add(`${size}: ${p}`);
  }
}
// A lights-out typed into the widget's Parameter field moves the night.
const moved = await run(new Date('2026-09-29T23:20:00+07:00').getTime(), 'large', '00:30');
const txt = JSON.stringify(moved.root);
if (!txt.includes('ปิดไฟ 00:30')) problems.add('Parameter 00:30 did not move lights-out');

console.log(`widget: ${runs} renders across ${SIZES.length} sizes`);
if (problems.size) {
  console.log([...problems].slice(0, 20).join('\n'));
  process.exit(1);
}
console.log('widget: all checks passed');
