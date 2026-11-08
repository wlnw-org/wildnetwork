import { hashIp } from "@/lib/auth";
import { deleteContributor, SHARE, sharedTotals, storeItems, type SharedItem } from "@/lib/sharedAnswers";

/** Opt-in checked answers from Wildlife Network Studio (Settings, "Share my checked answers").
 * POST {key, app, items[]} stores up to 200 answers; DELETE {key} removes everything shared with that key; GET gives totals. */
const KEY = /^[0-9a-f]{64}$/;
const ipLimit = new Map<string, { n: number; day: string }>();

export async function GET() {
  return Response.json(await sharedTotals(), { headers: { "cache-control": "public, s-maxage=3600" } });
}

export async function POST(req: Request) {
  let b: { key?: string; app?: string; items?: SharedItem[] };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (!KEY.test(b.key ?? "")) return Response.json({ error: "Missing or malformed key." }, { status: 400 });
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > SHARE.BATCH) return Response.json({ error: `Send 1 to ${SHARE.BATCH} items.` }, { status: 400 });
  // A loose per-instance guard against floods; the per-contributor daily limit is the real one.
  const ip = hashIp("share", (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"), day = new Date().toISOString().slice(0, 10);
  const c = ipLimit.get(ip); const n = c?.day === day ? c.n + 1 : 1; ipLimit.set(ip, { n, day });
  if (n > 400) return Response.json({ error: "Too many requests today." }, { status: 429 });
  const r = await storeItems(b.key!, b.items, typeof b.app === "string" ? b.app.slice(0, 24) : null);
  return Response.json(r.body, { status: r.status });
}

export async function DELETE(req: Request) {
  let b: { key?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (!KEY.test(b.key ?? "")) return Response.json({ error: "Missing or malformed key." }, { status: 400 });
  return Response.json({ deleted: await deleteContributor(b.key!) });
}
