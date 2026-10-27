import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { SITE } from "@/lib/site";

/**
 * Sign-in with ORCID (the researcher identifier), used by study areas and arrival reviews. Off unless ORCID_CLIENT_ID and
 * ORCID_CLIENT_SECRET are set (a free Public API client registered at orcid.org/developer-tools, redirect URI
 * https://wlnw.org/api/auth/orcid/callback). Only the /authenticate scope: we learn the iD and public name, nothing else.
 * The session is a signed cookie (no session table): orcid, name and expiry, HMAC with SESSION_SECRET.
 */
export const ORCID_ENABLED = !!process.env.ORCID_CLIENT_ID && !!process.env.ORCID_CLIENT_SECRET;
const ORCID_BASE = process.env.ORCID_BASE ?? "https://orcid.org";
export const REDIRECT_URI = `${SITE}/api/auth/orcid/callback`;
const COOKIE = "wn_session";
const DAYS = 30;

const secret = () => createHash("sha256").update(process.env.SESSION_SECRET ?? `session:${process.env.CRON_SECRET ?? ""}`).digest();
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export interface Session { orcid: string; name: string }

function encode(s: Session & { exp: number }): string {
  const data = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function decode(raw: string | undefined): Session | null {
  if (!raw) return null;
  const [data, mac] = raw.split(".");
  if (!data || !mac) return null;
  const want = Buffer.from(sign(data)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString()) as Session & { exp: number };
    return s.exp > Date.now() && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(s.orcid) ? { orcid: s.orcid, name: s.name } : null;
  } catch { return null; }
}

export async function getSession(): Promise<Session | null> {
  return decode((await cookies()).get(COOKIE)?.value);
}

export async function setSession(s: Session) {
  (await cookies()).set(COOKIE, encode({ ...s, exp: Date.now() + DAYS * 86_400_000 }), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: DAYS * 86_400,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** A signed, short-lived state value carrying where to return after sign-in (CSRF protection for the OAuth round trip). */
export function makeState(next: string): string {
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/research";
  const data = Buffer.from(JSON.stringify({ n: safe, t: Date.now(), r: randomBytes(8).toString("hex") })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function readState(state: string | null): string | null {
  if (!state) return null;
  const [data, mac] = state.split(".");
  if (!data || !mac || sign(data) !== mac) return null;
  try {
    const s = JSON.parse(Buffer.from(data, "base64url").toString()) as { n: string; t: number };
    return Date.now() - s.t < 15 * 60_000 ? s.n : null;
  } catch { return null; }
}

export function authorizeUrl(next: string): string {
  const u = new URL(`${ORCID_BASE}/oauth/authorize`);
  u.search = new URLSearchParams({ client_id: process.env.ORCID_CLIENT_ID!, response_type: "code", scope: "/authenticate", redirect_uri: REDIRECT_URI, state: makeState(next) }).toString();
  return u.toString();
}

/** Exchange the code; ORCID returns the iD and the public name with the token. */
export async function exchangeCode(code: string): Promise<Session> {
  const r = await fetch(`${ORCID_BASE}/oauth/token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.ORCID_CLIENT_ID!, client_secret: process.env.ORCID_CLIENT_SECRET!, grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`ORCID token exchange failed (${r.status})`);
  const d = (await r.json()) as { orcid?: string; name?: string };
  if (!d.orcid) throw new Error("ORCID did not return an iD");
  const name = (d.name ?? "").trim().slice(0, 120) || d.orcid;
  await sql`INSERT INTO researchers (orcid, name) VALUES (${d.orcid}, ${name})
    ON CONFLICT (orcid) DO UPDATE SET name = EXCLUDED.name, last_seen = now()`;
  return { orcid: d.orcid, name };
}

/** Mutating requests must come from our own pages (the session cookie is SameSite=Lax; this closes the rest). */
export function sameOrigin(req: Request): boolean {
  const o = req.headers.get("origin");
  return !o || o === SITE || (process.env.VERCEL_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(o));
}

export const orcidUrl = (orcid: string) => `https://orcid.org/${orcid}`;
