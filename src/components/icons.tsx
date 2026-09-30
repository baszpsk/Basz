// Minimal stroke icon set (24px grid, 1.8px stroke).
import type { ComponentChildren } from 'preact';

type P = { size?: number; class?: string };
const S = (d: ComponentChildren, { size = 22, class: c }: P = {}) => (
  <svg class={c} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const I = {
  today: (p?: P) => S(<><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>, p),
  tasks: (p?: P) => S(<><rect x="3.5" y="4" width="17" height="16.5" rx="4" /><path d="m8 12 2.6 2.6L16 9.2" /></>, p),
  focus: (p?: P) => S(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.6 2M9.5 2.8h5" /></>, p),
  body: (p?: P) => S(<><path d="M4 9.5v5M20 9.5v5M7 7v10M17 7v10M7 12h10" /></>, p),
  hub: (p?: P) => S(<><rect x="3.5" y="3.5" width="7" height="7" rx="2.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2.2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2.2" /><rect x="13.5" y="13.5" width="7" height="7" rx="3.5" /></>, p),
  check: (p?: P) => S(<path d="m6 12.5 4 4 8-9" />, { size: 16, ...p }),
  plus: (p?: P) => S(<path d="M12 5v14M5 12h14" />, p),
  close: (p?: P) => S(<path d="M6 6l12 12M18 6 6 18" />, p),
  play: (p?: P) => S(<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />, p),
  pause: (p?: P) => S(<><rect x="6.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" /><rect x="14" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" /></>, p),
  skip: (p?: P) => S(<><path d="M6 5.5v13l9-6.5z" /><path d="M18 5.5v13" /></>, p),
  stop: (p?: P) => S(<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />, p),
  bell: (p?: P) => S(<><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>, p),
  spark: (p?: P) => S(<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9z" />, p),
  moon: (p?: P) => S(<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />, p),
  sun: (p?: P) => S(<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" /></>, p),
  pill: (p?: P) => S(<><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="m9.3 8.3 5.4 7.4" /></>, p),
  meal: (p?: P) => S(<><path d="M5 3.5v7a2.5 2.5 0 0 0 5 0v-7M7.5 3.5v17M16.5 20.5V3.5c-2 1-3 3-3 6v4h3" /></>, p),
  chart: (p?: P) => S(<><path d="M4 20.5h16" /><rect x="5.5" y="12" width="3" height="6" rx="1" /><rect x="10.5" y="7" width="3" height="11" rx="1" /><rect x="15.5" y="9.5" width="3" height="8.5" rx="1" /></>, p),
  store: (p?: P) => S(<><path d="M4 9.5 5.5 4h13L20 9.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0z" /><path d="M5.5 11.5v8.5h13v-8.5M10 20v-5h4v5" /></>, p),
  mail: (p?: P) => S(<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>, p),
  shirt: (p?: P) => S(<path d="M8.5 3.5 4 6l1.8 4 2.2-1v11.5h8V9l2.2 1L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z" />, p),
  cart: (p?: P) => S(<><path d="M3.5 4.5h2.3l2 11h10.4l1.8-8H7" /><circle cx="9.5" cy="19.3" r="1.3" /><circle cx="17" cy="19.3" r="1.3" /></>, p),
  gear: (p?: P) => S(<><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.1 7.4l2 1.2M17.9 15.4l2 1.2M4.1 16.6l2-1.2M17.9 8.6l2-1.2" /></>, p),
  wave: (p?: P) => S(<path d="M3 12c2.5-5 4.5-5 6 0s3.5 5 6 0 4.5-5 6 0" />, p),
  dumbbell: (p?: P) => S(<><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /></>, p),
  link: (p?: P) => S(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.6 6.7" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4" /></>, p),
  trophy: (p?: P) => S(<><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 13v4M8.5 20.5h7M9.5 17h5" /></>, p),
  flame: (p?: P) => S(<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.5 1.7 1.4 2.6 2.4 3 .1-2.9 1.4-5.2 3.3-6.5-.3 2.6.6 4.2 2 5.9 1.1 1.4 1.7 3 1.7 4.9 0 4.2-3.1 7.2-6.5 7.2z" />, p),
  arrow: (p?: P) => S(<path d="M9 5.5 15.5 12 9 18.5" />, p),
  back: (p?: P) => S(<path d="M15 5.5 8.5 12l6.5 6.5" />, p),
  pin: (p?: P) => S(<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>, p),
  trash: (p?: P) => S(<><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></>, p),
  edit: (p?: P) => S(<path d="M4 20h4.5L19.5 9 15 4.5 4 15.5zM13 6.5 17.5 11" />, p),
  clock: (p?: P) => S(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, p),
  user: (p?: P) => S(<><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c1.3-3.8 4.2-5.5 7.5-5.5s6.2 1.7 7.5 5.5" /></>, p),
  alarm: (p?: P) => S(<><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.5M4 5.5 6.5 3M20 5.5 17.5 3" /></>, p),
  wand: (p?: P) => S(<><path d="m4 20 11-11M14 4v3M18.5 5.5l-2 2M20 10h-3" /><path d="m13 7 4 4" /></>, p),
  drop: (p?: P) => S(<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z" />, p),
  news: (p?: P) => S(<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" /></>, p),
  stethoscope: (p?: P) => S(<><path d="M6 3.5v5a4 4 0 0 0 8 0v-5M10 12.5v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="10.5" r="2" /></>, p),
  download: (p?: P) => S(<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15" />, p),
  upload: (p?: P) => S(<path d="M12 16V5M7 9.5l5-5 5 5M4.5 19.5h15" />, p),
  camera: (p?: P) => S(<><path d="M4 8h3l1.8-2.5h6.4L17 8h3v11.5H4z" /><circle cx="12" cy="13.5" r="3.5" /></>, p),
};
