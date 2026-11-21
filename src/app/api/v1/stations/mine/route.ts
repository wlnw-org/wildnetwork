import { authenticate, hashIp } from "@/lib/auth";
import { setAlertPause, setTestMode } from "@/lib/baseDevices";
import { sql } from "@/lib/db";
import { clientIp } from "@/lib/devices";
import { getClaims, setClaims } from "@/lib/myStations";
import { sameOrigin } from "@/lib/orcid";
import { CLAIMS_PER_HOUR, PAUSE_CHOICES, addClaim, pauseUntil, removeClaim, validDeviceId, type PauseChoice } from "@/lib/stationClaims";

export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "private, no-store" } });
const ok = (extra: Record<string, unknown> = {}) => Response.json({ ok: true, ...extra }, { headers: { "cache-control": "private, no-store" } });

/**
 * "My stations" (/stations/mine). Body: { action: "claim", key } | { action: "forget" | "test" | "pause" | "resume", device, ... }.
 * claim checks a device key and remembers only the device id in a signed httpOnly cookie; the key is never stored, returned
 * or logged. Every other action works only on a device id in that cookie. Errors are short codes the page translates.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return no("origin", 403);
  let b: { action?: unknown; key?: unknown; device?: unknown; on?: unknown; pause?: unknown };
  try { b = await req.json(); } catch { return no("json"); }
  if (!b || typeof b !== "object") return no("json");
  const claims = await getClaims();

  if (b.action === "claim") {
    const key = typeof b.key === "string" ? b.key.trim() : "";
    const ipHash = hashIp("station-claim", clientIp(req));
    // Every attempt counts, wrong keys included, so the form cannot be used to guess keys.
    await sql`DELETE FROM station_claim_attempts WHERE at < now() - interval '1 day'`;
    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM station_claim_attempts WHERE ip_hash = ${ipHash} AND at > now() - interval '1 hour'`;
    if (n >= CLAIMS_PER_HOUR) return no("too-many", 429);
    await sql`INSERT INTO station_claim_attempts (ip_hash) VALUES (${ipHash})`;
    if (!/^wn_[A-Za-z0-9_-]{16,80}$/.test(key)) return no("bad-key");
    const info = await authenticate(new Request("http://local/", { headers: { "x-api-key": key } }));
    if (!info) return no("bad-key");
    if (!info.deviceId || !validDeviceId(info.deviceId)) return no("not-device");
    await setClaims(addClaim(claims, info.deviceId));
    return ok({ device: info.deviceId });
  }

  const device = b.device;
  if (!validDeviceId(device) || !claims.includes(device)) return no("not-claimed", 403);
  switch (b.action) {
    case "forget":
      await setClaims(removeClaim(claims, device));
      return ok();
    case "test":
      if (typeof b.on !== "boolean") return no("json");
      return (await setTestMode(device, b.on)) ? ok() : no("unknown", 404);
    case "pause":
      if (!PAUSE_CHOICES.includes(b.pause as PauseChoice)) return no("json");
      return (await setAlertPause(device, pauseUntil(b.pause as PauseChoice))) ? ok() : no("unknown", 404);
    case "resume":
      return (await setAlertPause(device, null)) ? ok() : no("unknown", 404);
    default:
      return no("json");
  }
}
