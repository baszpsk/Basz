import type { Task } from './types';

export type TabId = 'today' | 'tasks' | 'body' | 'hub';
export type HubPage = 'seoulful' | 'markets' | 'inbox' | 'laundry' | 'shop' | 'stats' | 'alarm' | 'settings' | 'hairline' | 'coach' | 'focus';

export interface Nav {
  tab: (t: TabId) => void;
  task: (t: Task) => void;
  add: (text: string, mode?: 'task' | 'idea', due?: string) => void;
  workout: (programId: string) => void;
  breath: (presetId?: string) => void;
  hub: (page: HubPage) => void;
  inbox: () => void;
  plan: () => void;
  /** Opens the Pomodoro timer; with a task it links it, and `start` begins a round when none is on. */
  focus: (task?: Task, start?: boolean) => void;
}
