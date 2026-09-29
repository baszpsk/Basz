import { render } from 'preact';
import { App } from './app';
import { paintSky } from './lib/sky';
import { store } from './lib/store';

paintSky();
store.init();
const root = document.getElementById('app');
if (root) {
  root.textContent = '';
  render(<App />, root);
}
