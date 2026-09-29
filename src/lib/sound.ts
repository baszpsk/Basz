// Small synthesized sounds (no audio files). Audio starts only after a tap.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.18, type: OscillatorType = 'sine') {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

export const sound = {
  unlock: () => ac(),
  tick: () => tone(1200, 0, 0.05, 0.05, 'triangle'),
  done: () => {
    tone(660, 0, 0.35);
    tone(880, 0.12, 0.4);
    tone(1320, 0.26, 0.6, 0.12);
  },
  chime: () => {
    tone(523.25, 0, 1.2, 0.2);
    tone(659.25, 0.18, 1.2, 0.16);
    tone(783.99, 0.36, 1.6, 0.14);
  },
  breathIn: () => tone(392, 0, 0.5, 0.05),
  breathOut: () => tone(261.63, 0, 0.6, 0.05),
};

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported on iOS */
  }
}
