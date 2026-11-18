import { authenticate } from "@/lib/auth";
import { sql } from "@/lib/db";
import { setTestMode } from "@/lib/baseDevices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function ownKey(req: Request, id: string) {
  const key = await authenticate(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (key.deviceId !== id) return Response.json({ error: "this key is not the key of this device" }, { status: 403 });
  return null;
}

/**
 * Device settings, with the device's own key. Body: { "test": true | false }. While test is on, the device's detections
 * are kept apart and never appear on the map, in history, reports or open data. Turning it off counts only detections
 * made after the switch.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await ownKey(req, id);
  if (denied) return denied;
  let b: { test?: unknown };
  try { b = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  if (typeof b.test !== "boolean") return Response.json({ error: "test must be true or false" }, { status: 400 });
  const r = await setTestMode(id, b.test);
  if (!r) return Response.json({ error: "unknown device" }, { status: 404 });
  return Response.json(r, { headers: { "cache-control": "private, no-store" } });
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const denied = await ownKey(req, id);
  if (denied) return denied;
  const [d] = await sql<{ test: boolean; field_since: Date | null }[]>`SELECT test, field_since FROM devices WHERE id = ${id}`;
  if (!d) return Response.json({ error: "unknown device" }, { status: 404 });
  return Response.json({ test: d.test, fieldSince: d.field_since }, { headers: { "cache-control": "private, no-store" } });
}
