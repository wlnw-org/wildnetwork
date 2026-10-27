import { hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sendMail } from "@/lib/alerts";
import { encryptToken } from "@/lib/optin";

/** "Propose a study" from /research: stored, and emailed to the maintainer. 3 per IP per day. */
export async function POST(req: Request) {
  let b: { name?: string; email?: string; affiliation?: string; question?: string; area?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const name = (b.name ?? "").trim().slice(0, 120), email = (b.email ?? "").trim().toLowerCase(), question = (b.question ?? "").trim().slice(0, 3000);
  if (name.length < 2 || question.length < 20) return Response.json({ error: "Please give your name and a sentence or two about the question." }, { status: 400 });
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  const ipHash = hashIp("proposals", (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown");
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM research_proposals WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= 3) return Response.json({ error: "Thank you, we have your earlier proposals. Please email arunrajiah@gmail.com for more." }, { status: 429 });
  const affiliation = (b.affiliation ?? "").trim().slice(0, 200) || null, area = (b.area ?? "").trim().slice(0, 300) || null;
  await sql`INSERT INTO research_proposals (name, email_enc, affiliation, question, area, ip_hash) VALUES (${name}, ${encryptToken(email)}, ${affiliation}, ${question}, ${area}, ${ipHash})`;
  await sendMail("proposal", "arunrajiah@gmail.com", `Study proposal from ${name}`,
    `${name}${affiliation ? ` (${affiliation})` : ""} <${email}>\nArea: ${area ?? "-"}\n\n${question}`).catch(() => false);
  return Response.json({ ok: true, message: "Thank you. We will reply by email, usually within a few days." });
}
