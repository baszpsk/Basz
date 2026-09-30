// Data layer. The artifact's `db` is the source of truth; localStorage keeps a
// cache for instant start-up plus a queue of writes that have not reached the
// server yet, so nothing is lost if the page closes or the network drops.

import { cap, errCode } from './claude';
import { DEFAULT_SETTINGS } from './defaults';
import type { Digest, MonthLog, Plan, Pomo, Settings, ShopItem, Task } from './types';

export { DEFAULT_SETTINGS };

export interface Meta {
  seen?: Record<string, number>;
  levels?: Record<string, number>;
  hasBand?: boolean;
  photos?: { id: string; url: string; at: number; note?: string }[];
  xpBonus?: number;
  challenge?: { week: string; accepted?: boolean };
  flowDurations?: Record<string, number>;
  onboarded?: boolean;
  /** When the last backup file was saved. */
  lastBackupAt?: number;
  /** The Pomodoro round in progress. */
  pomo?: Pomo;
  /** Keep the screen on while a round runs (default on). */
  keepAwake?: boolean;
}

export interface State {
  mode: 'booting' | 'cloud' | 'local';
  synced: boolean;
  settings: Settings;
  plan: Plan | null;
  meta: Meta;
  tasks: Record<string, Task>;
  logs: Record<string, MonthLog>;
  shop: Record<string, ShopItem>;
  digests: Record<string, Digest>;
  pending: number;
  failed: number;
  notice?: string;
}

type Op = { kind: 'set' | 'merge' | 'delete'; data?: Record<string, unknown> };

const K_CACHE = 'bz1:cache';
const K_PENDING = 'bz1:pending';
const K_FAILED = 'bz1:failed';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge<T extends Record<string, unknown>>(base: T | undefined, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  }
  return out as T;
}

function combine(prev: Op | undefined, next: Op): Op {
  if (!prev || next.kind !== 'merge') return next;
  if (prev.kind === 'delete') return { kind: 'set', data: next.data };
  return { kind: prev.kind, data: deepMerge(prev.data, next.data || {}) };
}

function lsGet<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the cloud copy still holds the data */
  }
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

class Store {
  s: State = {
    mode: 'booting',
    synced: false,
    settings: DEFAULT_SETTINGS,
    plan: null,
    meta: {},
    tasks: {},
    logs: {},
    shop: {},
    digests: {},
    pending: 0,
    failed: 0,
  };
  private listeners = new Set<() => void>();
  private db: any = null;
  private queue = new Map<string, Op>();
  private inflight = new Map<string, Op>();
  private exists = new Set<string>();
  private seen = { settings: false, plan: false, meta: false, tasks: false, logs: false, shop: false, digests: false };
  private retryTimer: number | undefined;
  private saveTimer: number | undefined;

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.s = { ...this.s, pending: this.queue.size + this.inflight.size };
    this.listeners.forEach((f) => f());
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveCache(), 400);
  }

  init() {
    const cached = lsGet<Partial<State>>(K_CACHE);
    if (cached) {
      this.s = {
        ...this.s,
        settings: { ...DEFAULT_SETTINGS, ...(cached.settings || {}) },
        plan: cached.plan ?? null,
        meta: cached.meta || {},
        tasks: cached.tasks || {},
        logs: cached.logs || {},
        shop: cached.shop || {},
        digests: cached.digests || {},
      };
    }
    const pending = lsGet<Record<string, Op>>(K_PENDING) || {};
    for (const [path, op] of Object.entries(pending)) this.queue.set(path, op);
    this.s.failed = Object.keys(lsGet<Record<string, Op>>(K_FAILED) || {}).length;
    this.applyQueueLocally();
    this.emit();
    cap('db').then((db) => {
      if (!db) {
        this.s = { ...this.s, mode: 'local' };
        this.emit();
        return;
      }
      this.db = db;
      this.s = { ...this.s, mode: 'cloud' };
      this.listen();
      this.emit();
    });
    window.addEventListener('online', () => this.flushAll());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.flushAll();
      else this.saveCache();
    });
  }

  private saveCache() {
    const months = Object.keys(this.s.logs).sort().slice(-4);
    const logs: Record<string, MonthLog> = {};
    months.forEach((m) => (logs[m] = this.s.logs[m]));
    const dKeys = Object.keys(this.s.digests).sort().slice(-10);
    const digests: Record<string, Digest> = {};
    dKeys.forEach((k) => (digests[k] = this.s.digests[k]));
    lsSet(K_CACHE, {
      settings: this.s.settings,
      plan: this.s.plan,
      meta: this.s.meta,
      tasks: this.s.tasks,
      logs,
      shop: this.s.shop,
      digests,
    });
  }

  private persistQueue() {
    // In-flight writes stay recorded until the server confirms them.
    const obj: Record<string, Op> = {};
    this.inflight.forEach((op, path) => (obj[path] = op));
    this.queue.forEach((op, path) => (obj[path] = combine(obj[path], op)));
    lsSet(K_PENDING, obj);
  }

  private markSeen(k: keyof Store['seen']) {
    if (this.seen[k]) return;
    this.seen[k] = true;
    if (Object.values(this.seen).every(Boolean)) {
      this.s = { ...this.s, synced: true };
      this.applyQueueLocally();
      this.flushAll();
    }
  }

  private onDbError = (e: unknown) => {
    const code = errCode(e);
    if (code === 'revoked' || code === 'not_granted') {
      this.s = { ...this.s, notice: 'หน้านี้ซิงก์ขึ้นคลาวด์ไม่ได้ ข้อมูลที่แก้จะเก็บไว้ในเครื่องนี้ก่อน' };
      this.emit();
    }
  };

  private listen() {
    const db = this.db;
    const docInto = (path: string, key: 'settings' | 'plan' | 'meta') =>
      db.doc(path).onSnapshot((snap: any) => {
        if (snap.exists) this.exists.add(path);
        const data = snap.exists ? clone(snap.data()) : null;
        if (key === 'settings') this.s = { ...this.s, settings: { ...DEFAULT_SETTINGS, ...(data || {}) } };
        else if (key === 'plan') this.s = { ...this.s, plan: data as Plan | null };
        else this.s = { ...this.s, meta: (data as Meta) || {} };
        this.markSeen(key);
        this.reapply(path);
        this.emit();
      }, (e: unknown) => {
        this.onDbError(e);
        this.markSeen(key);
      });

    docInto('cfg/settings', 'settings');
    docInto('cfg/plan', 'plan');
    docInto('cfg/meta', 'meta');

    const coll = (name: 'tasks' | 'logs' | 'shop' | 'digests', query: any) =>
      query.onSnapshot((qs: any) => {
        const map: Record<string, any> = {};
        for (const d of qs.docs) {
          if (!d.exists) continue;
          this.exists.add(`${name}/${d.id}`);
          map[d.id] = { ...clone(d.data()), id: d.id };
        }
        for (const c of qs.docChanges()) if (c.type === 'removed') this.exists.delete(`${name}/${c.doc.id}`);
        if (name === 'logs') {
          for (const id of Object.keys(map)) delete (map[id] as { id?: string }).id;
        }
        this.s = { ...this.s, [name]: map } as State;
        this.markSeen(name);
        this.reapplyPrefix(name + '/');
        this.emit();
      }, (e: unknown) => {
        this.onDbError(e);
        this.markSeen(name);
      });

    coll('tasks', db.collection('tasks'));
    coll('logs', db.collection('logs'));
    coll('shop', db.collection('shop'));
    coll('digests', db.collection('digests').orderBy('date', 'desc').limit(30));
  }

  /** Re-apply queued (unconfirmed) writes on top of a fresh server snapshot. */
  private reapply(path: string) {
    const op = this.queue.get(path);
    if (op) this.applyLocal(path, op);
  }
  private reapplyPrefix(prefix: string) {
    this.queue.forEach((op, path) => path.startsWith(prefix) && this.applyLocal(path, op));
  }
  private applyQueueLocally() {
    this.queue.forEach((op, path) => this.applyLocal(path, op));
  }

  private applyLocal(path: string, op: Op) {
    const [col, id] = path.split('/');
    const s = this.s;
    if (col === 'cfg') {
      const key = id as 'settings' | 'plan' | 'meta';
      const cur = (s as any)[key] || {};
      const next = op.kind === 'delete' ? null : op.kind === 'set' ? op.data : deepMerge(cur, op.data || {});
      this.s = { ...s, [key]: key === 'settings' ? { ...DEFAULT_SETTINGS, ...(next || {}) } : next } as State;
      return;
    }
    const bucket = { ...((s as any)[col] || {}) };
    if (op.kind === 'delete') delete bucket[id];
    else if (op.kind === 'set') bucket[id] = col === 'logs' ? clone(op.data) : { ...clone(op.data), id };
    else bucket[id] = deepMerge(bucket[id] || (col === 'logs' ? { month: id } : { id }), clone(op.data || {}));
    this.s = { ...s, [col]: bucket } as State;
  }

  /** Queue a write: applied locally at once, sent to the server in order. */
  write(path: string, op: Op) {
    // JSON round-trip drops `undefined` fields, which the store would reject.
    if (op.data) op = { ...op, data: JSON.parse(JSON.stringify(op.data)) };
    this.queue.set(path, combine(this.queue.get(path), op));
    this.applyLocal(path, op);
    this.persistQueue();
    this.emit();
    this.flush(path);
  }

  private flushAll() {
    this.queue.forEach((_, path) => this.flush(path));
  }

  private async flush(path: string) {
    if (!this.db || !this.s.synced || this.inflight.has(path)) return;
    const op = this.queue.get(path);
    if (!op) return;
    this.queue.delete(path);
    this.inflight.set(path, op);
    try {
      await this.exec(path, op);
      if (op.kind === 'delete') this.exists.delete(path);
      else this.exists.add(path);
    } catch (e) {
      const code = errCode(e);
      const transient = code === 'unavailable' || code === 'resource_exhausted' || (code === 'unknown' && !navigator.onLine);
      if (transient) {
        this.queue.set(path, combine(op, this.queue.get(path) || { kind: 'merge', data: {} }));
        window.clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.flushAll(), 2500 + Math.random() * 2500);
      } else if (code === 'revoked' || code === 'not_granted') {
        this.queue.set(path, combine(op, this.queue.get(path) || { kind: 'merge', data: {} }));
        this.onDbError(e);
      } else {
        const failed = lsGet<Record<string, Op>>(K_FAILED) || {};
        failed[path + '#' + Date.now()] = op;
        lsSet(K_FAILED, failed);
        this.s = { ...this.s, failed: Object.keys(failed).length, notice: `บันทึกขึ้นคลาวด์ไม่สำเร็จ (${code}) ข้อมูลยังอยู่ในเครื่องนี้` };
      }
    } finally {
      this.inflight.delete(path);
      this.persistQueue();
      this.emit();
      if (this.queue.has(path)) this.flush(path);
    }
  }

  private async exec(path: string, op: Op) {
    const ref = this.db.doc(path);
    if (op.kind === 'delete') return ref.delete();
    if (op.kind === 'set') return ref.set(op.data);
    const col = path.split('/')[0];
    const seed = col === 'logs' ? { month: path.split('/')[1] } : {};
    if (!this.exists.has(path)) return ref.set(deepMerge(seed, op.data || {}));
    try {
      return await ref.update(op.data);
    } catch (e) {
      if (errCode(e) !== 'invalid_argument') throw e;
      // The document vanished on the server: recreate it from the local copy.
      const [c, id] = path.split('/');
      const local = c === 'cfg' ? (this.s as any)[id] : (this.s as any)[c]?.[id];
      return ref.set(deepMerge(seed, local || op.data || {}));
    }
  }

  retryFailed() {
    const failed = lsGet<Record<string, Op>>(K_FAILED) || {};
    lsSet(K_FAILED, {});
    this.s = { ...this.s, failed: 0, notice: undefined };
    for (const [key, op] of Object.entries(failed)) this.write(key.split('#')[0], op);
    this.emit();
  }

  dismissNotice() {
    this.s = { ...this.s, notice: undefined };
    this.emit();
  }

  /** Everything in the store, for a backup file. */
  exportAll() {
    const s = this.s;
    return {
      app: 'Basz OS',
      exportedAt: new Date().toISOString(),
      settings: s.settings,
      plan: s.plan,
      meta: s.meta,
      tasks: s.tasks,
      logs: s.logs,
      shop: s.shop,
      digests: s.digests,
    };
  }

  importAll(data: any) {
    if (!data || data.app !== 'Basz OS') throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Basz OS');
    if (data.settings) this.write('cfg/settings', { kind: 'set', data: data.settings });
    if (data.plan) this.write('cfg/plan', { kind: 'set', data: data.plan });
    if (data.meta) this.write('cfg/meta', { kind: 'set', data: data.meta });
    for (const [id, t] of Object.entries(data.tasks || {})) this.write(`tasks/${id}`, { kind: 'set', data: t as any });
    for (const [id, l] of Object.entries(data.logs || {})) this.write(`logs/${id}`, { kind: 'set', data: l as any });
    for (const [id, x] of Object.entries(data.shop || {})) this.write(`shop/${id}`, { kind: 'set', data: x as any });
  }
}

export const store = new Store();
