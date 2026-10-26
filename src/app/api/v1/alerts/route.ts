import { hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ALERTS_ENABLED, ROLES, cellOf, emailHash, encryptEmail, geocode, newToken, sendConfirmation } from "@/lib/alerts";

const PER_IP_PER_DAY = 10;
const PER_EMAIL = 25;

/**
 * Species arrival alerts. Body: { action: "subscribe", email, species, place, role? } or { action: "unsubscribe", token }.
 * Subscribing sends a confirmation email; nothing else is sent until it is confirmed.
 * Also accepts the one-click unsubscribe POST mail clients send (?token=... with a form body).
 */
export async function POST(req: Request) {
  const qToken = new URL(req.url).searchParams.get("token");
  let b: { action?: string; email?: string; species?: string; place?: string; role?: string; token?: string } = {};
  if (qToken) b = { action: "unsubscribe", token: qToken };
  else try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }

  if (b.action === "unsubscribe") {
    const token = (b.token ?? "").trim();
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return Response.json({ error: "Invalid link." }, { status: 400 });
    await sql`DELETE FROM alert_subs WHERE token = ${token}`;
    return Response.json({ ok: true, message: "Unsubscribed. Your email address has been deleted for this alert." });
  }

  if (!ALERTS_ENABLED) return Response.json({ error: "Alerts are not available yet." }, { status: 503 });
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(email)) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  const place = (b.place ?? "").trim().slice(0, 80);
  if (place.length < 2) return Response.json({ error: "Please enter a town or city." }, { status: 400 });
  const role = ROLES.includes(b.role ?? "") ? b.role! : null;
  const [sp] = await sql<{ scientific_name: string; vernacular_name: string | null }[]>`
    SELECT g.scientific_name, (SELECT MIN(vernacular_name) FROM phenology p WHERE p.scientific_name = g.scientific_name) AS vernacular_name
    FROM species_group g WHERE g.scientific_name = ${(b.species ?? "").trim()} AND g.is_species LIMIT 1`;
  if (!sp) return Response.json({ error: "Unknown species." }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = hashIp("alerts", ip);
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM alert_subs WHERE created_ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= PER_IP_PER_DAY) return Response.json({ error: "Too many alerts set up from here today. Please try tomorrow." }, { status: 429 });
  const hash = emailHash(email);
  const [{ m }] = await sql<{ m: number }[]>`SELECT COUNT(*)::int AS m FROM alert_subs WHERE email_hash = ${hash}`;
  if (m >= PER_EMAIL) return Response.json({ error: `One email can follow up to ${PER_EMAIL} species and places.` }, { status: 400 });

  const geo = await geocode(place).catch(() => null);
  if (!geo) return Response.json({ error: "Could not find that place. Try a nearby town or city." }, { status: 400 });
  const cell = cellOf(geo.lat, geo.lon);
  const token = newToken();
  const [row] = await sql<{ token: string; confirmed: boolean }[]>`
    INSERT INTO alert_subs (email_enc, email_hash, scientific_name, place, cell_lat, cell_lon, role, token, created_ip_hash)
    VALUES (${encryptEmail(email)}, ${hash}, ${sp.scientific_name}, ${geo.label}, ${cell.lat}, ${cell.lon}, ${role}, ${token}, ${ipHash})
    ON CONFLICT (email_hash, scientific_name, cell_lat, cell_lon) DO UPDATE SET role = COALESCE(EXCLUDED.role, alert_subs.role)
    RETURNING token, confirmed_at IS NOT NULL AS confirmed`;
  if (row.confirmed) return Response.json({ ok: true, place: geo.label, message: `You already have this alert for ${geo.label}.` });
  const sent = await sendConfirmation(email, row.token, sp.vernacular_name ?? sp.scientific_name, geo.label, sp.scientific_name);
  if (!sent) return Response.json({ error: "Could not send the confirmation email right now. Please try again later." }, { status: 503 });
  return Response.json({ ok: true, place: geo.label, message: `Almost done: check your inbox and confirm. Your area is the 5 degree square around ${geo.label}.` });
}
