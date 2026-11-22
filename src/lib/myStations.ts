import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { loadStations, stationSlug } from "@/lib/stations";
import { hashIp } from "@/lib/auth";
import { clientIp } from "@/lib/devices";
import { CLAIM_COOKIE, CLAIM_DAYS, CLAIMS_PER_HOUR, claimSecret, decodeClaims, encodeClaims, onlineState, pausedForever, type OnlineState } from "@/lib/stationClaims";

/** Server side of /stations/mine: the claimed device ids from the signed cookie, and what the owner sees for each. */

export async function getClaims(): Promise<string[]> {
  return decodeClaims((await cookies()).get(CLAIM_COOKIE)?.value, claimSecret());
}

/**
 * Counts one key check from this address (wrong keys included, so key checks cannot be used to guess keys).
 * False when the address is over CLAIMS_PER_HOUR.
 */
export async function countClaimAttempt(req: Request): Promise<boolean> {
  const ipHash = hashIp("station-claim", clientIp(req));
  await sql`DELETE FROM station_claim_attempts WHERE at < now() - interval '1 day'`;
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM station_claim_attempts WHERE ip_hash = ${ipHash} AND at > now() - interval '1 hour'`;
  if (n >= CLAIMS_PER_HOUR) return false;
  await sql`INSERT INTO station_claim_attempts (ip_hash) VALUES (${ipHash})`;
  return true;
}

export const claimCookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: CLAIM_DAYS * 86_400 } as const;

export async function setClaims(ids: string[]) {
  const c = await cookies();
  if (!ids.length) { c.delete(CLAIM_COOKIE); return; }
  c.set(CLAIM_COOKIE, encodeClaims(ids, claimSecret()), claimCookieOptions);
}

export interface MyDevice {
  id: string; name: string; model: string; test: boolean; alertsPausedUntil: string | null; alertsPausedForever: boolean;
  lastHeard: string | null; stationUrl: string | null; health: Record<string, unknown> | null; healthAt: string | null;
  /** online, off (no health report for a while) or never reported. Devices without health reports count as never. */
  state: OnlineState;
}

export async function loadMyDevices(ids: string[]): Promise<MyDevice[]> {
  if (!ids.length) return [];
  const rows = await sql<{ id: string; name: string; model: string; test: boolean; paused: Date | null; deployment_id: string | null; last_status_at: Date | null; last_test: Date | null; s: Record<string, unknown> | null }[]>`
    SELECT d.id, d.name, d.model, d.test, CASE WHEN d.alerts_paused_until > now() THEN d.alerts_paused_until END AS paused,
           d.deployment_id, d.last_status_at, d.last_status AS s,
           (SELECT MAX(event_start) FROM test_events t WHERE t.device_id = d.id) AS last_test
    FROM devices d WHERE d.id = ANY(${ids})`;
  const stations = await loadStations(rows.map((r) => r.deployment_id).filter((x): x is string => !!x)).catch(() => []);
  const out = rows.map((r) => {
    const st = r.deployment_id ? stations.find((s) => s.id === r.deployment_id) : undefined;
    const heard = [r.last_status_at, r.last_test, st?.lastHeard ? new Date(st.lastHeard) : null]
      .filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      id: r.id, name: r.name, model: r.model, test: r.test, alertsPausedUntil: r.paused?.toISOString() ?? null, alertsPausedForever: pausedForever(r.paused),
      lastHeard: heard?.toISOString() ?? null, stationUrl: st ? `/stations/${stationSlug(st.id)}` : null,
      health: r.s, healthAt: r.last_status_at?.toISOString() ?? null, state: onlineState(r.last_status_at),
    };
  });
  return out.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}
