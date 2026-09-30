// Caffeine timing tied to the sleep window. The app does not move lights-out
// by itself: he has no sleep tracker, and how long it took to fall asleep is
// a guess, not a measurement, so the window stays where the settings put it.
import { fmtHM, parseHM } from './time';
import type { Settings } from './types';

/** Last caffeine: the stored cut-off, but never later than 12 hours before lights-out. */
export function caffeineCutoff(st: Settings): string {
  const R = st.rolloverHour;
  return fmtHM(Math.min(parseHM(st.coffeeCutoff, R), parseHM(st.lightsOut, R) - 720));
}
