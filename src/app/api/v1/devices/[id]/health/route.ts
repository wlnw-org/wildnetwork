import { authenticate } from "@/lib/auth";
import { deviceHealth, normalizeHealth, pruneStatus, storeStatus } from "@/lib/baseDevices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The key must be this device's own key: health is private to the device and whoever holds its key. */
async function owner(req: Request, id: string) {
  const key = await authenticate(req);
  if (!key) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (key.deviceId !== id) return { error: Response.json({ error: "this key is not the key of this device" }, { status: 403 }) };
  return { key };
}

/**
 * Health heartbeat from a Wildlife Network Base (every 15 minutes; queued ones may come as an array, up to 200).
 * Body: { at, software: {name: version}, uptimeSeconds, boots, temperatureC, storage: {freeMb, totalMb},
 * microphone: {active, lastDetectionAt}, queue: {pending}, network: {type, signal, signalUnit} }. Unknown fields are dropped.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const o = await owner(req, id);
  if (o.error) return o.error;
  if (Number(req.headers.get("content-length") ?? 0) > 500_000) return Response.json({ error: "body too large" }, { status: 413 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  const items = (Array.isArray(body) ? body : [body]).slice(0, 200);
  let stored = 0;
  const rejected: { index: number; error: string }[] = [];
  for (const [index, item] of items.entries()) {
    const h = normalizeHealth(id, item);
    if (!h.ok) { rejected.push({ index, error: h.error }); continue; }
    if (await storeStatus(id, h.at, h.status)) stored++;
  }
  await pruneStatus(id);
  return Response.json({ received: items.length, stored, rejected: rejected.length, rejectedDetails: rejected.slice(0, 10) });
}

/** Latest heartbeat and history for the owner (BirdEcho). ?days= up to 90, default 7. */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const o = await owner(req, id);
  if (o.error) return o.error;
  const days = Number(new URL(req.url).searchParams.get("days") ?? 7) || 7;
  return Response.json(await deviceHealth(id, days), { headers: { "cache-control": "private, no-store" } });
}
