import { hashIp } from "@/lib/auth";
import { subscribe, unsubscribe, validToken } from "@/lib/updates";

/**
 * Update emails. Body: { action: "subscribe", email } or { action: "unsubscribe", token }.
 * Subscribing sends a confirmation email; nothing else is sent until it is confirmed.
 * Also accepts the one-click unsubscribe POST mail clients send (?token=... with a form body).
 */
export async function POST(req: Request) {
  const qToken = new URL(req.url).searchParams.get("token");
  let b: { action?: string; email?: string; token?: string } = {};
  if (qToken) b = { action: "unsubscribe", token: qToken };
  else try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }

  if (b.action === "unsubscribe") {
    const token = (b.token ?? "").trim();
    if (!validToken(token)) return Response.json({ error: "Invalid link." }, { status: 400 });
    await unsubscribe(token);
    return Response.json({ ok: true, message: "Unsubscribed. Your email address has been deleted." });
  }
  if (b.action !== "subscribe") return Response.json({ error: "Unknown action." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const r = await subscribe(String(b.email ?? ""), hashIp("updates", ip));
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status });
}
