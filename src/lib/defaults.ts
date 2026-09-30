// Default daily rhythm. Kept apart from the store so the Home Screen widget
// can build the same day without loading the browser data layer.

import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  wake: '09:30',
  lightsOut: '01:00',
  meal1: '10:30',
  meal2: '19:00',
  workoutTime: '13:00',
  workoutDays: [1, 3, 5],
  rolloverHour: 6,
  focus: { work: 25, rest: 5, autoBreak: true, longRest: 15, longEvery: 4 },
  coffeeCutoff: '13:00',
  dryHours: 8,
  proteinTarget: 110,
  breathTargetMin: 30,
  stepsTarget: 8000,
  tradingDays: [1, 2, 3, 4, 5],
};
