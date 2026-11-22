/**
 * Small in-process cache for public API answers and costly summaries. Each app copy keeps its own (no CDN sits in
 * front of the server, so `s-maxage` headers alone cache nothing).
 *
 * - Fresh for ttlMs: served from memory.
 * - Then stale for up to staleMs more: served from memory at once while one background refresh runs.
 * - Older, or missing: computed now; concurrent callers for the same key share one computation (single flight).
 * - Bounded: at most MAX_ENTRIES and MAX_BYTES (string sizes), oldest-used dropped first.
 * Failures are never cached.
 */
const MAX_ENTRIES = 300;
const MAX_BYTES = 64 * 1024 * 1024;

interface Entry { at: number; value: unknown; bytes: number }
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let total = 0;

const sizeOf = (v: unknown) => (typeof v === "string" ? v.length : 1024);

function put(key: string, value: unknown, now: number) {
  const old = store.get(key);
  if (old) { total -= old.bytes; store.delete(key); }
  const bytes = sizeOf(value);
  store.set(key, { at: now, value, bytes });
  total += bytes;
  // Map keeps insertion order: the first keys are the least recently used (get() re-inserts on use).
  for (const [k, e] of store) {
    if (store.size <= MAX_ENTRIES && total <= MAX_BYTES) break;
    store.delete(k); total -= e.bytes;
  }
}

function run<T>(key: string, compute: () => Promise<T>, clock: () => number): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = compute()
    .then((v) => { put(key, v, clock()); return v; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function memo<T>(key: string, ttlMs: number, staleMs: number, compute: () => Promise<T>, clock: () => number = Date.now): Promise<T> {
  const now = clock();
  const e = store.get(key);
  if (e) {
    const age = now - e.at;
    // Mark as recently used.
    store.delete(key); store.set(key, e);
    if (age < ttlMs) return e.value as T;
    if (age < ttlMs + staleMs) {
      run(key, compute, clock).catch(() => undefined);
      return e.value as T;
    }
  }
  return run(key, compute, clock);
}

/** A JSON answer served from memo as a ready string (no re-serialising per request). */
export async function memoJson(key: string, ttlMs: number, staleMs: number, compute: () => Promise<unknown>, headers: Record<string, string>): Promise<Response> {
  const body = await memo(key, ttlMs, staleMs, async () => JSON.stringify(await compute()));
  return new Response(body, { headers: { "content-type": "application/json", ...headers } });
}

/** True at most once per intervalMs per key in this process (cheap gate before costlier lock queries). */
const gates = new Map<string, number>();
export function every(key: string, intervalMs: number, now: number = Date.now()): boolean {
  const last = gates.get(key);
  if (last !== undefined && now - last < intervalMs) return false;
  gates.set(key, now);
  return true;
}

/** For tests. */
export function _resetMemo() { store.clear(); inflight.clear(); gates.clear(); total = 0; }
