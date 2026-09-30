// ตัวเลือกช่วงเวลาของหน้าสถิติ วางเป็นแถวเดียวเหนือทุกอย่างที่มันกรอง
// ชนิดช่วงที่เลือกจำไว้ในเครื่องนี้ แต่เปิดใหม่จะกลับมาที่ช่วงปัจจุบันเสมอ

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { defaultSel, RANGE_OPTIONS, shiftSel, type Period, type RangeKind, type RangeSel } from '../lib/range';
import { I } from './icons';
import { Seg } from './ui';

const KEY = /^\d{4}-\d{2}-\d{2}$/;

export function useRange(storeKey: string, initial: RangeKind, today: string): [RangeSel, (s: RangeSel) => void] {
  const [sel, setSel] = useState<RangeSel>(() => {
    const base = defaultSel(initial, today);
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      if (saved && RANGE_OPTIONS.some((o) => o.id === saved.kind)) {
        const s: RangeSel = { ...base, kind: saved.kind };
        if (KEY.test(saved.from) && KEY.test(saved.to)) {
          s.from = saved.from;
          s.to = saved.to;
        }
        return s;
      }
    } catch {
      /* เครื่องนี้เก็บค่าไม่ได้ ใช้ค่าเริ่มต้น */
    }
    return base;
  });
  // ข้ามวันขณะเปิดหน้าอยู่: ช่วงที่กำลังดูวันนี้ตามไปเป็นวันใหม่
  const [day, setDay] = useState(today);
  useEffect(() => {
    if (today === day) return;
    setSel((s) => (s.anchor === day ? { ...s, anchor: today } : s));
    setDay(today);
  }, [today]);
  const set = (s: RangeSel) => {
    setSel(s);
    try {
      localStorage.setItem(storeKey, JSON.stringify({ kind: s.kind, from: s.from, to: s.to }));
    } catch {
      /* ไม่จำก็ไม่เป็นไร */
    }
  };
  return [sel, set];
}

export function RangeBar(props: { sel: RangeSel; period: Period; onChange: (s: RangeSel) => void; today: string; first?: string; id?: string }) {
  const { sel, period: p, today } = props;
  const scroller = useRef<HTMLDivElement>(null);
  // แถบเลื่อนแนวนอนได้ จึงเลื่อนให้ปุ่มที่เลือกอยู่ในจอเสมอ
  useLayoutEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>('button.on');
    if (!box || !el) return;
    const l = el.offsetLeft - 12;
    const r = el.offsetLeft + el.offsetWidth + 12;
    if (l < box.scrollLeft) box.scrollLeft = l;
    else if (r > box.scrollLeft + box.clientWidth) box.scrollLeft = r - box.clientWidth;
  }, [sel.kind]);
  const date = (field: 'from' | 'to') => (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (KEY.test(v)) props.onChange({ ...sel, [field]: v > today ? today : v });
  };
  return (
    <div class="rangebar">
      <div class="seg-scroll" ref={scroller}>
        <Seg id={props.id} options={RANGE_OPTIONS} value={sel.kind} onChange={(kind) => props.onChange({ ...sel, kind, anchor: today })} />
      </div>
      {sel.kind === 'custom' ? (
        <>
          <div class="row" style={{ gap: '10px' }}>
            <label class="datefield grow">
              จาก
              <input type="date" id={props.id && `${props.id}-from`} value={sel.from} min={props.first} max={today} onChange={date('from')} />
            </label>
            <label class="datefield grow">
              ถึง
              <input type="date" id={props.id && `${props.id}-to`} value={sel.to} min={props.first} max={today} onChange={date('to')} />
            </label>
          </div>
          <div class="tiny center">{p.dates}</div>
        </>
      ) : (
        <div class="row rangenav">
          {sel.kind !== 'all' && (
            <button class="icon-btn" aria-label="ช่วงก่อนหน้า" disabled={!p.canBack} onClick={() => props.onChange(shiftSel(sel, -1))}>
              {I.back({ size: 18 })}
            </button>
          )}
          <div class="grow center">
            <div class="h3">{p.title}</div>
            <div class="tiny">{p.dates}</div>
          </div>
          {sel.kind !== 'all' && (
            <button class="icon-btn" aria-label="ช่วงถัดไป" disabled={!p.canNext} onClick={() => props.onChange(shiftSel(sel, 1))}>
              {I.arrow({ size: 18 })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
