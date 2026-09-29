import { render } from 'preact';
import { App } from './app';
import { paintSky } from './lib/sky';
import { store } from './lib/store';

// Thai line breaking and font selection follow the document language.
document.documentElement.lang = 'th';
paintSky();
store.init();
const root = document.getElementById('app');
if (root) {
  root.textContent = '';
  render(<App />, root);
}
