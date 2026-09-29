# Basz OS

แอปจัดชีวิตส่วนตัวของ Basz เปิดมาแล้วรู้ทันทีว่า **ตอนนี้ต้องทำอะไร**: ตารางวันที่คำนวณจากเวลานอน ยา มื้ออาหาร การเทรด และการออกกำลังกาย งานที่ Claude ช่วยจัดลำดับและถามรายละเอียดที่ขาด ตัวนับเซ็ตออกกำลังกาย ฝึกหายใจ แผนสุขภาพพร้อมแหล่งอ้างอิง ขั้นตอนซักผ้าที่ตามต่อจนเก็บเข้าตู้ และศูนย์รวมร้าน Seoulful

## Where it runs

- เผยแพร่เป็น **Claude Artifact** แบบส่วนตัว (เปิดได้เฉพาะเจ้าของ)
- ข้อมูลเก็บในฐานข้อมูลของ artifact โดยตั้งกฎให้ **เจ้าของเท่านั้น** อ่าน/เขียนได้ และมีสำเนาในเครื่องสำหรับเปิดเร็ว การเปลี่ยนแปลงที่ยังส่งไม่ถึงเซิร์ฟเวอร์จะถูกเก็บรอส่งใหม่เอง
- ข้อมูลส่วนตัว (ยา แผนสุขภาพ ลิงก์ร้าน รายการซื้อของ) **ไม่อยู่ใน repo นี้** อยู่ในฐานข้อมูลเท่านั้น

## Structure

```
src/
  main.tsx, app.tsx      shell, liquid tab bar, sheets, error boundary
  styles.css             design tokens (dark-first + light), Liquid Glass surfaces
  lib/store.ts           cloud sync + local cache + write queue
  lib/schedule.ts        builds the day from settings and the private plan
  lib/priority.ts        explainable task ranking and slotting
  lib/xp.ts              stats, levels, streaks, trophies, weekly challenges
  lib/ai.ts              Claude calls (task parsing, day planning, idea breakdown, coach)
  content/               exercise library, laundry playbook (LG FV1412)
  screens/               Today, Tasks, Body (train, breathe, health), Hub
test/                    Playwright end-to-end checks with a mocked Claude runtime
assets/                  app icon
```

## Build & test

```bash
npm install
npm run typecheck
npm run build      # -> dist/basz-os.html (one file)
npm test           # iPhone-size checks in dark and light themes
```
