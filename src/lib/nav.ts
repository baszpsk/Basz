import type { Task } from './types';

export type TabId = 'today' | 'tasks' | 'body' | 'hub';
export type HubPage = 'seoulful' | 'markets' | 'inbox' | 'laundry' | 'shop' | 'stats' | 'alarm' | 'settings' | 'hairline' | 'coach';

export interface Nav {
  tab: (t: TabId) => void;
  task: (t: Task) => void;
  add: (text: string, mode?: 'task' | 'idea') => void;
  workout: (programId: string) => void;
  breath: (presetId?: string) => void;
  hub: (page: HubPage) => void;
  inbox: () => void;
  plan: () => void;
}
