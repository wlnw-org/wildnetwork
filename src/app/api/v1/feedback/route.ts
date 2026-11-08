import { hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sendMail } from "@/lib/alerts";
import { encryptToken } from "@/lib/optin";
import { MAINTAINER } from "@/lib/projects";

const KINDS = ["problem", "idea", "data", "other"] as const;
const PRODUCTS = ["website", "studio", "birdecho", "agent", "other"] as const;
const LABEL: Record<string, string> = { problem: "Problem", idea: "Idea", data: "Data issue", other: "Feedback", website: "website", studio: "Studio", birdecho: "BirdEcho", agent: "station agent" };

/** Feedback and problem reports from /feedback (also opened from Studio with its version filled in). Stored, then emailed to the maintainer. 5 per IP per day. */
export async function POST(req: Request) {
  let b: { kind?: string; product?: string; message?: string; email?: string; context?: string; website?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (b.website) return Response.json({ ok: true, message: "Thank you." }); // honeypot field, hidden from people
  const kind = KINDS.includes(b.kind as never) ? b.kind! : "other", product = PRODUCTS.includes(b.product as never) ? b.product! : "other";
  const message = (b.message ?? "").trim().slice(0, 5000), email = (b.email ?? "").trim().toLowerCase().slice(0, 254);
  const context = (b.context ?? "").trim().slice(0, 300) || null;
  if (message.length < 10) return Response.json({ error: "Please write a sentence or two." }, { status: 400 });
  if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return Response.json({ error: "That email address does not look right. Leave it empty if you do not want a reply." }, { status: 400 });
  const ipHash = hashIp("feedback", (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown");
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM feedback WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= 5) return Response.json({ error: `Thank you, we have your earlier messages. Please email ${MAINTAINER.email} for more.` }, { status: 429 });
  await sql`DELETE FROM feedback WHERE created_at < now() - interval '1 year'`;
  const [{ id }] = await sql<{ id: number }[]>`INSERT INTO feedback (kind, product, message, email_enc, context, ip_hash)
    VALUES (${kind}, ${product}, ${message}, ${email ? encryptToken(email) : null}, ${context}, ${ipHash}) RETURNING id`;
  const sent = await sendMail("feedback", MAINTAINER.email, `${LABEL[kind]} about ${LABEL[product]}: ${message.slice(0, 60).replace(/\s+/g, " ")}`,
    `${LABEL[kind]} about ${LABEL[product]}\nFrom: ${email || "no email given"}\n${context ? `Context: ${context}\n` : ""}\n${message}\n\n(feedback #${id})`).catch(() => false);
  if (sent) await sql`UPDATE feedback SET emailed = true WHERE id = ${id}`;
  return Response.json({ ok: true, message: email ? "Thank you. We read every message and will reply by email if we need more detail." : "Thank you. We read every message." });
}
