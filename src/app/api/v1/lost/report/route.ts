import { randomUUID } from "node:crypto";
import { hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";
import { watchNames } from "@/lib/lost";
import { matchLost } from "@/lib/lostNames";
import { encryptToken } from "@/lib/optin";
import { sameOrigin } from "@/lib/orcid";

/** A possible sighting of a lost species sent by a visitor (/lost-species/report). It only goes to the private review
 *  queue (lost_flags, source 'community'); nothing is published. 5 per IP per day. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  let b: { species?: string; date?: string; place?: string; lat?: unknown; lon?: unknown; link?: string; note?: string; email?: string; website?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (b.website) return Response.json({ ok: true }); // honeypot
  const species = (b.species ?? "").trim().replace(/\s*\(.*$/, "").slice(0, 120);
  const lostId = matchLost(species, await watchNames());
  if (lostId === null) return Response.json({ error: "Please choose a species from the lost species list." }, { status: 400 });
  const date = (b.date ?? "").trim();
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!when || when.getTime() > Date.now() + 86_400_000 || when.getFullYear() < 1900) return Response.json({ error: "Please give the date of the sighting." }, { status: 400 });
  const place = (b.place ?? "").trim().slice(0, 300);
  const lat = Number(b.lat), lon = Number(b.lon);
  const hasPoint = b.lat !== "" && b.lon !== "" && b.lat != null && b.lon != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!place && !hasPoint) return Response.json({ error: "Please say where it was, in words or as coordinates." }, { status: 400 });
  const link = (b.link ?? "").trim().slice(0, 500);
  if (link && !/^https:\/\/\S+$/.test(link)) return Response.json({ error: "The link should start with https://" }, { status: 400 });
  const note = (b.note ?? "").trim().slice(0, 3000);
  if (!link && note.length < 20) return Response.json({ error: "Please add a link to your photo or recording, or describe what you saw or heard." }, { status: 400 });
  const email = (b.email ?? "").trim().toLowerCase().slice(0, 254);
  if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return Response.json({ error: "That email address does not look right." }, { status: 400 });

  const ipHash = hashIp("lost-report", (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown");
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM lost_flags WHERE source_system = 'community' AND detail->>'ipHash' = ${ipHash} AND first_seen > now() - interval '1 day'`;
  if (n >= 5) return Response.json({ error: "Thank you, we have your earlier reports. Please write to us through the feedback page for more." }, { status: 429 });
  await sql`INSERT INTO lost_flags ${sql({
    flag_key: `record:community:${randomUUID()}`, lost_id: lostId, name_received: species, kind: "record", source_system: "community",
    source_record: null, source_url: null, observed_at: when, period: null, latitude: hasPoint ? lat : null, longitude: hasPoint ? lon : null,
    count: null, confidence: null, media_type: null, media_url: link || null,
    detail: sql.json({ place: place || null, note: note || null, emailEnc: email ? encryptToken(email) : null, ipHash }),
  })}`;
  return Response.json({ ok: true });
}
