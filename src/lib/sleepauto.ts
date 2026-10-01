// สรุปการนอนของเมื่อคืน (และคืนก่อนหน้าที่อาจพลาดไป) เองเมื่อเปิดแอป เขียนเฉพาะตอนผลเปลี่ยน
// เขียนลงช่อง auto เท่านั้น ไม่แตะช่อง user ที่เจ้าของเลือก แก้ หรือบอกให้ข้าม
// ไม่คำนวณคืนที่เครื่องยังไม่ได้เริ่มจด และไม่คิดใหม่หลังได้ผลสุดท้ายแล้ว
// เพื่อไม่ให้ข้อมูลการใช้ที่ถูกล้างหรือจดไม่ครบมาเขียนทับผลที่ดีกว่า

import { patchDay } from './actions';
import { bedTsAt, detectNight, guessOf, nightWindow, sameGuess, sleepOf, wakeDateFor } from './sleeplog';
import { store } from './store';
import { addDays } from './time';
import { usageSessions, usageSince } from './usage';

function updateNight(wakeDate: string, now: Date, since: number) {
  const s = store.s;
  const [ws, we] = nightWindow(wakeDate);
  if (since >= we) return;
  const rec = sleepOf(s.logs, wakeDate);
  if (rec?.user) return;
  const cur = rec?.auto;
  // ผลที่จดหลัง 15:00 ของวันตื่นคือผลสุดท้ายแล้ว
  if (cur && cur.at >= we) return;
  // เครื่องเริ่มจดกลางหน้าต่าง: ใช้ได้แค่คืนแรกที่ยังไม่มีผล และเริ่มจดก่อนเวลาปิดไฟตามแผน
  if (since > ws && (cur || since > bedTsAt(wakeDate, s.settings.lightsOut))) return;
  const night = detectNight(usageSessions(), wakeDate, now.getTime(), s.settings, since);
  if (!night) return;
  const next = guessOf(night, now.getTime());
  if (cur && sameGuess(cur, next)) return;
  patchDay(wakeDate, { sleep: { auto: next } });
}

export function updateSleep(now = new Date()) {
  if (!store.s.synced) return;
  const today = wakeDateFor(now);
  const since = usageSince();
  if (!today || since === null) return;
  for (const k of [addDays(today, -1), today]) updateNight(k, now, since);
}
