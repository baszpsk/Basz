import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { sound } from '../lib/sound';
import type { Area } from '../lib/types';
import { I } from './icons';

export const toneOf = (a?: Area) => (a ? `var(--a-${a})` : 'var(--accent)');

export function Glass(props: { class?: string; children?: ComponentChildren; tone?: string; style?: JSX.CSSProperties; onClick?: () => void }) {
  const style = { ...(props.style || {}), ...(props.tone ? { '--tone': props.tone } : {}) } as JSX.CSSProperties;
  return (
    <div class={`glass ${props.class || ''}`} style={style} onClick={props.onClick}>
      {props.children}
    </div>
  );
}

export function Check(props: { on: boolean; tone?: string; onToggle: (e: MouseEvent) => void; label: string }) {
  return (
    <button
      class={`check ${props.on ? 'on' : ''}`}
      style={{ '--tone': props.tone || 'var(--good)' } as JSX.CSSProperties}
      aria-pressed={props.on}
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        props.onToggle(e as unknown as MouseEvent);
      }}
    >
      {I.check({ size: 15 })}
    </button>
  );
}

export function Seg<T extends string>(props: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 4, width: 0 });
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button.on');
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [props.value, props.options.length]);
  return (
    <div class="seg" ref={ref} role="tablist" id={props.id}>
      <span class="thumb" style={{ left: thumb.left + 'px', width: thumb.width + 'px' }} />
      {props.options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === props.value} class={o.id === props.value ? 'on' : ''} onClick={() => props.onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Ring(props: { value: number; size?: number; stroke?: number; tone?: string; children?: ComponentChildren; label?: string }) {
  const size = props.size || 64;
  const sw = props.stroke || 6;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, props.value || 0));
  return (
    <div style={{ position: 'relative', width: size + 'px', height: size + 'px', flex: 'none' }} role="img" aria-label={props.label}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" stroke-width={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={props.tone || 'var(--accent)'}
          stroke-width={sw}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{props.children}</div>
    </div>
  );
}

export function Progress(props: { value: number; tone?: string; label?: string }) {
  return (
    <div class="progress" style={{ '--tone': props.tone } as JSX.CSSProperties} role="progressbar" aria-label={props.label} aria-valuenow={Math.round(props.value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(1, props.value)) * 100}%` }} />
    </div>
  );
}

export function Sheet(props: { open: boolean; onClose: () => void; title?: string; children?: ComponentChildren; wide?: boolean }) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [props.open]);
  if (!props.open) return null;
  return (
    <>
      <div class="backdrop" onClick={props.onClose} />
      <div class="sheet glass" role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="grabber" />
        {props.title && (
          <div class="sheet-head">
            <h2 class="h2 grow">{props.title}</h2>
            <button class="icon-btn" aria-label="Close" onClick={props.onClose}>
              {I.close({ size: 18 })}
            </button>
          </div>
        )}
        {props.children}
      </div>
    </>
  );
}

export function Stepper(props: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; unit?: string }) {
  const step = props.step || 1;
  const clamp = (v: number) => Math.max(props.min ?? 0, Math.min(props.max ?? 9999, v));
  return (
    <div class="row" aria-label={props.label}>
      <button class="icon-btn" aria-label={`Less ${props.label}`} onClick={() => { sound.tick(); props.onChange(clamp(props.value - step)); }}>
        <span style={{ fontSize: '22px', lineHeight: 1 }}>−</span>
      </button>
      <div class="display-num" style={{ minWidth: '64px', textAlign: 'center', fontSize: '28px' }}>
        {props.value}
        {props.unit && <span class="tiny"> {props.unit}</span>}
      </div>
      <button class="icon-btn" aria-label={`More ${props.label}`} onClick={() => { sound.tick(); props.onChange(clamp(props.value + step)); }}>
        {I.plus({ size: 20 })}
      </button>
    </div>
  );
}

export function Empty(props: { title: string; body?: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="h3">{props.title}</div>
      {props.body && <div>{props.body}</div>}
      {props.children && <div style={{ marginTop: '12px' }}>{props.children}</div>}
    </div>
  );
}

export function Pill(props: { tone?: string; children: ComponentChildren }) {
  return (
    <span class="pill" style={{ '--tone': props.tone } as JSX.CSSProperties}>
      {props.children}
    </span>
  );
}

// ---------- Toasts and XP bursts (outside the component tree) ----------
type ToastMsg = { id: number; text: string };
let toastListener: ((t: ToastMsg | null) => void) | null = null;
let toastTimer: number | undefined;
export function toast(text: string) {
  if (!text) return;
  toastListener?.({ id: Date.now(), text });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastListener?.(null), 2600);
}
export function ToastHost() {
  const [t, setT] = useState<ToastMsg | null>(null);
  useEffect(() => {
    toastListener = setT;
    return () => {
      toastListener = null;
    };
  }, []);
  if (!t) return null;
  return (
    <div class="toast glass" key={t.id} role="status" aria-live="polite">
      {t.text}
    </div>
  );
}

export function burst(x: number, y: number, text: string, tone = 'var(--good)') {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const f = document.createElement('div');
  f.className = 'xp-float';
  f.textContent = text;
  f.style.left = x + 'px';
  f.style.top = y - 12 + 'px';
  f.style.color = tone;
  document.body.appendChild(f);
  window.setTimeout(() => f.remove(), 1200);
  if (reduce) return;
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
    const d = 26 + Math.random() * 22;
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.background = tone;
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    document.body.appendChild(s);
    window.setTimeout(() => s.remove(), 800);
  }
}

export function burstFrom(e: Event | undefined, text: string, tone?: string) {
  const el = e?.currentTarget as HTMLElement | null;
  if (el?.getBoundingClientRect) {
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top, text, tone);
  } else burst(window.innerWidth / 2, window.innerHeight / 2, text, tone);
}
