import { authenticate } from "@/lib/auth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A test station's own detections (kept apart from the public tables), newest first, for its owner only. ?limit= up to 1000. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = await authenticate(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (key.deviceId !== id) return Response.json({ error: "this key is not the key of this device" }, { status: 403 });
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 200) || 200, 1), 1000);
  const rows = await sql<{ event: unknown }[]>`SELECT event FROM test_events WHERE device_id = ${id} ORDER BY event_start DESC LIMIT ${limit}`;
  return Response.json({ events: rows.map((r) => r.event) }, { headers: { "cache-control": "private, no-store" } });
}
