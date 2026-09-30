// Packs the Home Screen widget for the ScriptWidget app (a .swt file is a ZIP
// holding widget.json and main.jsx). Personal data (medicines)
// comes from seed/private, so the output stays in the git-ignored dist/.
//
//   node widget/build.mjs [--settings path/to/settings.json]
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

const NAME = 'Basz OS';
const OUT = 'dist/widget';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const settingsPath = arg('--settings');
const settings = settingsPath ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
for (const k of Object.keys(settings)) if (k.startsWith('__')) delete settings[k];
const meds = existsSync('seed/private/plan.mjs') ? (await import('../seed/private/plan.mjs')).plan.meds || [] : [];

const engine = await build({
  entryPoints: ['widget/engine.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'BaszEngine',
  target: ['es2019'],
  minify: true,
  logLevel: 'warning',
});

const built = new Date().toISOString().slice(0, 10);
const data = { built, settings, meds: meds.map(({ id, time, name, days }) => ({ id, time, name, ...(days ? { days } : {}) })) };
const main = [
  `// ${NAME} widget · built ${built} from github.com/baszpsk/basz (widget/)`,
  `const BASZ = ${JSON.stringify(data)};`,
  engine.outputFiles[0].text.trim(),
  readFileSync('widget/widget.jsx', 'utf8'),
].join('\n');

const manifest = {
  formatVersion: 2,
  id: 'os.basz.widget',
  name: NAME,
  version: `1.0.0-${built.replaceAll('-', '')}`,
  runtimeVersion: '1.0',
  entry: 'main.jsx',
  supportedFamilies: ['systemSmall', 'systemMedium', 'systemLarge', 'systemExtraLargePortrait', 'accessoryInline', 'accessoryRectangular', 'accessoryCircular'],
  permissions: [],
  networkDomains: [],
  description: 'ตารางวันนี้จาก Basz OS: ตอนนี้ ถัดไป และเวลาปิดไฟ',
};

mkdirSync(`${OUT}/${NAME}`, { recursive: true });
writeFileSync(`${OUT}/${NAME}/main.jsx`, main);
writeFileSync(`${OUT}/${NAME}/widget.json`, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(`${OUT}/${NAME}.swt`, zip([
  { name: `${NAME}/` },
  { name: `${NAME}/widget.json`, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
  { name: `${NAME}/main.jsx`, data: Buffer.from(main) },
]));
console.log(`${OUT}/${NAME}.swt  main.jsx ${(Buffer.byteLength(main) / 1024).toFixed(1)} KB · ${meds.length} medicines · settings ${Object.keys(settings).length ? settingsPath : 'defaults'}`);

// Minimal ZIP writer (deflate, UTF-8 names, fixed timestamps).
function zip(entries) {
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const dir = e.name.endsWith('/');
    const raw = dir ? Buffer.alloc(0) : e.data;
    const body = dir ? raw : deflateRawSync(raw, { level: 9 });
    const method = dir ? 0 : 8;
    const crc = dir ? 0 : crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((((dir ? 0o40755 : 0o100644) << 16) | (dir ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
