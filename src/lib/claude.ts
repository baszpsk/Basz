// Access to the Claude Artifact runtime (window.claude.use). Every capability
// may be absent (preview, thumbnail, a copy of the page elsewhere), so each
// getter resolves null instead of throwing.

type Win = Window & { claude?: { use?: (name: string) => Promise<unknown> } };

const cache = new Map<string, Promise<any>>();

export function cap<T = any>(name: string): Promise<T | null> {
  let p = cache.get(name);
  if (!p) {
    const c = (window as Win).claude;
    p = c && typeof c.use === 'function'
      ? c.use(name).then((v) => v ?? null, () => null)
      : Promise.resolve(null);
    cache.set(name, p);
  }
  return p as Promise<T | null>;
}

export const errCode = (e: unknown): string =>
  e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : 'unknown';
