import { useEffect, useState } from 'preact/hooks';
import { store } from './store';

export function useStore() {
  const [, setN] = useState(0);
  useEffect(() => {
    const off = store.subscribe(() => setN((n) => n + 1));
    return () => {
      off();
    };
  }, []);
  return store.s;
}

export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    const vis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs]);
  return now;
}

export function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}
