import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * "My stations" (/stations/mine), pure parts: the signed cookie that remembers which devices this browser proved it holds
 * the key for, and the alert pause rules shared with the device settings route. No database here, so it runs under tests.
 *
 * Cookie: base64url(JSON {d: device ids, exp}) + "." + HMAC-SHA256. The key itself is never stored, only the device ids
 * the key proved. The HMAC secret is derived from SESSION_SECRET with its own label, so it cannot be swapped with the
 * ORCID session cookie.
 */
export const CLAIM_COOKIE = "wn_stations";
export const CLAIM_DAYS = 180;
export const MAX_CLAIMS = 10;
export const CLAIMS_PER_HOUR = 10;
const DEVICE_ID = /^wn[a-z]_[A-Za-z0-9_-]{1,40}$/;

export const claimSecret = (base = process.env.SESSION_SECRET ?? `session:${process.env.CRON_SECRET ?? ""}`) =>
  createHash("sha256").update(`stations:${base}`).digest();

const mac = (data: string, secret: Buffer) => createHmac("sha256", secret).update(data).digest("base64url");

export const validDeviceId = (id: unknown): id is string => typeof id === "string" && DEVICE_ID.test(id);

/** Newest first, unique, valid, at most MAX_CLAIMS. Pure. */
export function cleanIds(ids: unknown[]): string[] {
  const out: string[] = [];
  for (const id of ids) if (validDeviceId(id) && !out.includes(id)) out.push(id);
  return out.slice(0, MAX_CLAIMS);
}

export function encodeClaims(ids: string[], secret: Buffer, now = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ d: cleanIds(ids), exp: now + CLAIM_DAYS * 86_400_000 })).toString("base64url");
  return `${data}.${mac(data, secret)}`;
}

/** The device ids in a cookie, or [] when it is missing, tampered with or expired. Pure. */
export function decodeClaims(raw: string | undefined, secret: Buffer, now = Date.now()): string[] {
  if (!raw || raw.length > 4000) return [];
  const [data, sig] = raw.split(".");
  if (!data || !sig) return [];
  const want = Buffer.from(mac(data, secret)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return [];
  try {
    const c = JSON.parse(Buffer.from(data, "base64url").toString()) as { d?: unknown; exp?: unknown };
    if (typeof c.exp !== "number" || c.exp <= now || !Array.isArray(c.d)) return [];
    return cleanIds(c.d);
  } catch { return []; }
}

/**
 * One-time-ish link from the BirdEcho app: the app proves the key to /api/v1/stations/mine/link and gets back
 * /stations/mine/link?t=<token>, which adds that device to the browser's cookie. The token holds only the device id and
 * expires after LINK_MINUTES, signed with its own label so it can never pass as a claims cookie.
 */
export const LINK_MINUTES = 10;
export const linkSecret = (base = process.env.SESSION_SECRET ?? `session:${process.env.CRON_SECRET ?? ""}`) =>
  createHash("sha256").update(`station-link:${base}`).digest();

export function encodeLink(deviceId: string, secret: Buffer, now = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ l: deviceId, exp: now + LINK_MINUTES * 60_000 })).toString("base64url");
  return `${data}.${mac(data, secret)}`;
}

/** The device id in a link token, or null when it is tampered with, expired or not a device. Pure. */
export function decodeLink(raw: string | null | undefined, secret: Buffer, now = Date.now()): string | null {
  if (!raw || raw.length > 400) return null;
  const [data, sig] = raw.split(".");
  if (!data || !sig) return null;
  const want = Buffer.from(mac(data, secret)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(data, "base64url").toString()) as { l?: unknown; exp?: unknown };
    if (typeof c.exp !== "number" || c.exp <= now) return null;
    return validDeviceId(c.l) ? c.l : null;
  } catch { return null; }
}

/** Adds a device (newest first); the oldest drops off past MAX_CLAIMS. Pure. */
export const addClaim = (ids: string[], id: string) => cleanIds([id, ...ids.filter((x) => x !== id)]);
export const removeClaim = (ids: string[], id: string) => ids.filter((x) => x !== id);

/** Alert pauses: at most about 100 years ahead. "Until I turn them back on" is stored as FOREVER_YEARS ahead. */
export const PAUSE_MAX_YEARS = 100;
export const FOREVER_YEARS = 99;
const YEAR_MS = 365.25 * 86_400_000;

/**
 * Validates alertsPausedUntil from a device or the owner page: null resumes, an ISO time pauses until then (a past time
 * also means alerts are on). Pure.
 */
export function parsePause(v: unknown, now = Date.now()): { ok: true; until: Date | null } | { ok: false; error: string } {
  if (v === null) return { ok: true, until: null };
  if (typeof v !== "string" || v.length > 40 || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v.trim())) {
    return { ok: false, error: "alertsPausedUntil must be an ISO time or null" };
  }
  const t = Date.parse(v.trim());
  if (!Number.isFinite(t)) return { ok: false, error: "alertsPausedUntil must be an ISO time or null" };
  if (t > now + PAUSE_MAX_YEARS * YEAR_MS) return { ok: false, error: `alertsPausedUntil must be within ${PAUSE_MAX_YEARS} years` };
  return { ok: true, until: t <= now ? null : new Date(t) };
}

export type PauseChoice = "day" | "week" | "month" | "forever";
export const PAUSE_CHOICES: PauseChoice[] = ["day", "week", "month", "forever"];

/** End of a pause chosen on the owner page. Pure. */
export function pauseUntil(choice: PauseChoice, now = Date.now()): Date {
  const d = new Date(now);
  if (choice === "day") return new Date(now + 86_400_000);
  if (choice === "week") return new Date(now + 7 * 86_400_000);
  if (choice === "month") { d.setUTCMonth(d.getUTCMonth() + 1); return d; }
  return new Date(now + FOREVER_YEARS * YEAR_MS);
}

/** True for a pause long enough to read as "until you turn them back on". Pure. */
export const pausedForever = (until: Date | string | null, now = Date.now()) =>
  !!until && new Date(until).getTime() - now > 50 * YEAR_MS;

export const alertsPaused = (until: Date | string | null, now = Date.now()) => !!until && new Date(until).getTime() > now;

/** Which Bases get a monitor email: never test stations, never while alerts are paused. Pure. */
export const alertsWanted = (d: { test: boolean; alerts_paused_until: Date | null }, now = Date.now()) =>
  !d.test && !alertsPaused(d.alerts_paused_until, now);
