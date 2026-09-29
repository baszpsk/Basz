// One JSON file with everything in the app. Saving one records when, so the
// app can remind the owner to keep a copy of his history outside Claude.
import { saveMeta } from './actions';
import { cap } from './claude';
import { store } from './store';
import { todayKey } from './time';

export type BackupResult = 'saved' | 'declined' | 'unavailable' | 'failed';

export async function saveBackup(): Promise<BackupResult> {
  const downloads = await cap('downloads');
  if (!downloads) return 'unavailable';
  const data = JSON.stringify(store.exportAll(), null, 1);
  try {
    await downloads.save({ filename: `basz-os-backup-${todayKey(new Date(), 6)}.json`, data });
    saveMeta({ lastBackupAt: Date.now() });
    return 'saved';
  } catch (e: any) {
    return e?.code === 'declined' ? 'declined' : 'failed';
  }
}

export const BACKUP_EVERY_DAYS = 30;
