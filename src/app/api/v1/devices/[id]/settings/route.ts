import { authenticate } from "@/lib/auth";
import { sql } from "@/lib/db";
import { setAlertPause, setTestMode } from "@/lib/baseDevices";
import { parsePause } from "@/lib/stationClaims";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function ownKey(req: Request, id: string) {
  const key = await authenticate(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (key.deviceId !== id) return Response.json({ error: "this key is not the key of this device" }, { status: 403 });
  return null;
}

/**
 * Device settings, with the device's own key. Body: { "test"?: true | false, "alertsPausedUntil"?: "<ISO>" | null }, either
 * or both. While test is on, the device's detections are kept apart and never appear on the map, in history, reports or
 * open data. Turning it off counts only detections made after the switch. alertsPausedUntil stops the health emails
 * until that time (at most about 100 years ahead); null turns them back on. Returns the current settings.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await ownKey(req, id);
  if (denied) return denied;
  let b: { test?: unknown; alertsPausedUntil?: unknown };
  try { b = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  if (!b || typeof b !== "object") return Response.json({ error: "body must be a JSON object" }, { status: 400 });
  const hasTest = "test" in b, hasPause = "alertsPausedUntil" in b;
  if (!hasTest && !hasPause) return Response.json({ error: "send test and/or alertsPausedUntil" }, { status: 400 });
  if (hasTest && typeof b.test !== "boolean") return Response.json({ error: "test must be true or false" }, { status: 400 });
  const pause = hasPause ? parsePause(b.alertsPausedUntil) : null;
  if (pause && !pause.ok) return Response.json({ error: pause.error }, { status: 400 });
  if (hasTest && !(await setTestMode(id, b.test as boolean))) return Response.json({ error: "unknown device" }, { status: 404 });
  if (pause?.ok && !(await setAlertPause(id, pause.until))) return Response.json({ error: "unknown device" }, { status: 404 });
  return current(id);
}

async function current(id: string) {
  const [d] = await sql<{ test: boolean; field_since: Date | null; alerts_paused_until: Date | null }[]>`
    SELECT test, field_since, CASE WHEN alerts_paused_until > now() THEN alerts_paused_until END AS alerts_paused_until FROM devices WHERE id = ${id}`;
  if (!d) return Response.json({ error: "unknown device" }, { status: 404 });
  return Response.json({ test: d.test, fieldSince: d.field_since, alertsPausedUntil: d.alerts_paused_until }, { headers: { "cache-control": "private, no-store" } });
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await ownKey(req, id);
  if (denied) return denied;
  return current(id);
}
