// Builds src/ into one self-contained HTML page for the Claude Artifact viewer.
// Preact is loaded from jsDelivr (pinned); everything else is inlined.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PREACT = JSON.parse(readFileSync('node_modules/preact/package.json', 'utf8')).version;
const dev = process.argv.includes('--dev');

const preactGlobals = {
  name: 'preact-globals',
  setup(b) {
    b.onResolve({ filter: /^preact(\/hooks)?$/ }, (a) => ({ path: a.path, namespace: 'preact-global' }));
    b.onLoad({ filter: /.*/, namespace: 'preact-global' }, (a) => ({
      contents: a.path === 'preact' ? 'module.exports = window.preact;' : 'module.exports = window.preactHooks;',
      loader: 'js',
    }));
  },
};

const js = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020', 'safari15'],
  minify: !dev,
  sourcemap: false,
  jsx: 'transform',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  inject: ['src/jsx-shim.ts'],
  plugins: [preactGlobals],
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()), __DEV__: String(dev) },
  logLevel: 'warning',
});

const css = await build({
  entryPoints: ['src/styles.css'],
  bundle: true,
  write: false,
  minify: !dev,
  loader: { '.css': 'css' },
  logLevel: 'warning',
});

const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const style = css.outputFiles[0].text;
const splash = readFileSync('src/splash.html', 'utf8');

const html = `<title>Basz OS</title>
<meta name="theme-color" content="#f2f6fc">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@300..700&family=Plus+Jakarta+Sans:wght@400..800&display=swap">
<style>${style}</style>
<div id="app">${splash}</div>
<script src="https://cdn.jsdelivr.net/npm/preact@${PREACT}/dist/preact.umd.js"></script>
<script src="https://cdn.jsdelivr.net/npm/preact@${PREACT}/hooks/dist/hooks.umd.js"></script>
<script>${script}</script>
`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/basz-os.html', html);
console.log(`dist/basz-os.html  ${(html.length / 1024).toFixed(1)} KB  (preact ${PREACT})`);
