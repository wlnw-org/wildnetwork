import { randomBytes } from "node:crypto";
import { hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";
import { arrivalHtml, confirmHtml, emailImage, watchConfirmHtml, watchHtml } from "@/lib/emails";
import { watchDigest, worthSending, type WatchArrival } from "@/lib/engage";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { getSpeciesMedia } from "@/lib/media";
import { tryDecrypt, encryptToken } from "@/lib/optin";
import { SITE, SITE_NAME, speciesSlug } from "@/lib/site";

/**
 * Species arrival alerts by email. Off unless RESEND_API_KEY and ALERTS_FROM are set.
 *
 * A subscription is an email, a species and a 5 degree cell (from a place name, geocoded once; no coordinates are kept).
 * An alert goes out when the species is recorded in that cell this week or last after at least ARRIVAL.ABSENT_WEEKS
 * watched weeks without it, at most once per ARRIVAL.QUIET_WEEKS. Emails are AES-GCM encrypted at rest.
 */
export const ALERTS_ENABLED = !!process.env.RESEND_API_KEY && !!process.env.ALERTS_FROM;
export const ARRIVAL = { ABSENT_WEEKS: 4, MIN_RECORDS: 3, QUIET_WEEKS: 8 };
/** Resend's free plan sends 100 a day; keep a margin for confirmations. */
const DAILY_CAP = 90;
export const ROLES = ["researcher", "birder", "educator", "station owner", "other"];

export const emailHash = (email: string) => hashIp("alert-email", email.trim().toLowerCase());
export const newToken = () => randomBytes(18).toString("base64url");
export const cellOf = (lat: number, lon: number) => ({ lat: Math.floor(lat / 5) * 5, lon: Math.floor(lon / 5) * 5 });

/** Place name to coordinates with the free Open-Meteo geocoder (server side; the place name is all the visitor sends). */
export async function geocode(place: string): Promise<{ label: string; lat: number; lon: number } | null> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(place)}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const d = (await r.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
  const g = d.results?.[0];
  if (!g) return null;
  return { label: [g.name, g.admin1, g.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "), lat: g.latitude, lon: g.longitude };
}

async function sentToday(): Promise<number> {
  await sql`DELETE FROM alert_mail_log WHERE at < now() - interval '2 days'`;
  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM alert_mail_log WHERE at > now() - interval '1 day'`;
  return n;
}

export async function sendMail(kind: string, to: string, subject: string, text: string, unsubscribeUrl?: string, html?: string, extra: { replyTo?: string; cc?: string } = {}): Promise<boolean> {
  if (!ALERTS_ENABLED || (await sentToday()) >= DAILY_CAP) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERTS_FROM, to: [to], subject, text, ...(html ? { html } : {}),
      ...(extra.replyTo ? { reply_to: extra.replyTo } : {}), ...(extra.cc ? { cc: [extra.cc] } : {}),
      ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) { console.error("alert mail", r.status, (await r.text()).slice(0, 200)); return false; }
  await sql`INSERT INTO alert_mail_log (kind) VALUES (${kind})`;
  return true;
}

export const encryptEmail = (email: string) => encryptToken(email.trim().toLowerCase());
const unsubscribeUrl = (token: string) => `${SITE}/alerts/unsubscribe?token=${token}`;
/** For the one-click List-Unsubscribe POST that mail clients send (RFC 8058). */
const oneClickUrl = (token: string) => `${SITE}/api/v1/alerts?token=${token}`;

/** Photo for an email: the cached species image, at email width. Never blocks sending. */
async function photo(scientificName: string): Promise<{ url: string | null; credit: string | null }> {
  const m = await getSpeciesMedia(scientificName).catch(() => null);
  return { url: m ? emailImage(m.thumbUrl, m.imageUrl) : null, credit: m ? [m.attribution, m.license].filter(Boolean).join(", ") || null : null };
}

export async function sendConfirmation(email: string, token: string, species: string, place: string, scientificName: string): Promise<boolean> {
  const confirmUrl = `${SITE}/alerts/confirm?token=${token}`;
  const img = await photo(scientificName);
  return sendMail("confirm", email, `Confirm your ${species} alert`,
    `Someone (hopefully you) asked ${SITE_NAME} to email this address when the ${species} arrives near ${place}.\n\n` +
    `Confirm: ${SITE}/alerts/confirm?token=${token}\n\n` +
    `If this was not you, ignore this email: nothing is sent without confirmation and the request is deleted after 7 days.\n\n${SITE_NAME}, ${SITE}`,
    undefined, confirmHtml({ name: species, place, confirmUrl, imageUrl: img.url }));
}

const fmtWeek = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** Checks every confirmed subscription and sends arrival emails. Runs from the status trigger every few hours. */
export async function checkAlerts(budgetMs = 60_000): Promise<{ checked: number; sent: number }> {
  const t0 = Date.now();
  await sql`DELETE FROM alert_subs WHERE confirmed_at IS NULL AND created_at < now() - interval '7 days'`;
  if (!ALERTS_ENABLED) return { checked: 0, sent: 0 };
  // Per subscription: records this week and last, and how many of the weeks before were watched (class effort) with no record.
  const due = await sql<{ id: number; email_enc: string; token: string; scientific_name: string; vernacular_name: string | null; place: string; week: string; n: number; absent: number }[]>`
    WITH subs AS (
      SELECT s.*, COALESCE(g.grp, 'avian') AS grp FROM alert_subs s LEFT JOIN species_group g USING (scientific_name)
      WHERE s.confirmed_at IS NOT NULL AND s.scientific_name <> ${WATCH_MARK} AND (s.last_alert_at IS NULL OR s.last_alert_at < now() - make_interval(weeks => ${ARRIVAL.QUIET_WEEKS}))
    ), now_rec AS (
      SELECT s.id, MAX(w.week)::text AS week, SUM(w.count)::int AS n, MIN(w.vernacular_name) AS vernacular_name
      FROM subs s JOIN species_weekly w ON w.scientific_name = s.scientific_name AND w.cell_lat = s.cell_lat AND w.cell_lon = s.cell_lon
      WHERE w.week >= date_trunc('week', now())::date - 7
      GROUP BY s.id HAVING SUM(w.count) >= ${ARRIVAL.MIN_RECORDS}
    )
    SELECT s.id, s.email_enc, s.token, s.scientific_name, r.vernacular_name, s.place, r.week, r.n,
      (SELECT COUNT(*)::int FROM effort_weekly e
        WHERE e.cell_lat = s.cell_lat AND e.cell_lon = s.cell_lon AND e.grp = s.grp AND e.detections > 0
          AND e.week < date_trunc('week', now())::date - 7 AND e.week >= date_trunc('week', now())::date - 7 - 7 * ${ARRIVAL.ABSENT_WEEKS}
          AND NOT EXISTS (SELECT 1 FROM species_weekly w2 WHERE w2.scientific_name = s.scientific_name AND w2.week = e.week
                          AND w2.cell_lat = s.cell_lat AND w2.cell_lon = s.cell_lon)) AS absent
    FROM subs s JOIN now_rec r ON r.id = s.id`;
  let sent = 0;
  for (const d of due) {
    if (Date.now() - t0 > budgetMs) break;
    if (d.absent < ARRIVAL.ABSENT_WEEKS) continue; // present all along, or not watched enough to call it an arrival
    const name = d.vernacular_name ?? d.scientific_name;
    const img = await photo(d.scientific_name);
    const html = arrivalHtml({
      name, scientificName: d.scientific_name, place: d.place, week: fmtWeek(d.week), records: d.n, absentWeeks: d.absent,
      imageUrl: img.url, imageCredit: img.credit, speciesUrl: `${SITE}/species/${speciesSlug(d.scientific_name)}`,
      mapUrl: `${SITE}/?species=${encodeURIComponent(d.scientific_name)}`, unsubscribeUrl: unsubscribeUrl(d.token),
    });
    const to = tryDecrypt(d.email_enc);
    if (!to) continue; // encrypted with an older key: skipped, never deleted
    const ok = await sendMail("alert", to, `${name} has arrived near ${d.place}`,
      `The ${name} (${d.scientific_name}) was recorded ${d.n} ${d.n === 1 ? "time" : "times"} in your area in the week of ${fmtWeek(d.week)}, ` +
      `after ${d.absent} watched weeks without a record. Your area is the 5 degree square around ${d.place}.\n\n` +
      `See where it is now: ${SITE}/species/${speciesSlug(d.scientific_name)}\n` +
      `Live map: ${SITE}/?species=${encodeURIComponent(d.scientific_name)}\n\n` +
      `Records come from acoustic sensors and open biodiversity records, and automatic identification makes mistakes. How this is measured: ${SITE}/methods\n\n` +
      `You will hear about this species again only after it has been away for a while. Stop these emails: ${unsubscribeUrl(d.token)}`,
      oneClickUrl(d.token), html);
    if (!ok) break; // daily cap or mail error: try again next run
    await sql`UPDATE alert_subs SET last_alert_at = now(), last_alert_week = ${d.week} WHERE id = ${d.id}`;
    sent++;
  }
  return { checked: due.length, sent };
}

/**
 * Migration watch: a subscription for a place, not a species. Stored in alert_subs with this marker as the species, so it
 * shares the confirm and unsubscribe links, the daily mail cap and the privacy rules of species alerts.
 */
export const WATCH_MARK = "_migration_watch";

export async function sendWatchConfirmation(email: string, token: string, place: string): Promise<boolean> {
  const confirmUrl = `${SITE}/alerts/confirm?token=${token}`;
  return sendMail("confirm", email, `Confirm your migration watch for ${place}`,
    `Someone (hopefully you) asked ${SITE_NAME} for a weekly migration watch for ${place}: which migrants arrived lately and which are due soon, only in weeks with news.\n\n` +
    `Confirm: ${confirmUrl}\n\nIf this was not you, ignore this email: nothing is sent without confirmation and the request is deleted after 7 days.\n\n${SITE_NAME}, ${SITE}`,
    undefined, watchConfirmHtml({ place, confirmUrl }));
}

/** Monday of the current UTC week, as YYYY-MM-DD. */
const thisMonday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

/** The digest for one 5 degree area: birds only, arrival support >= 0.5, sensitive species left out. */
async function cellDigest(cellLat: number, cellLon: number, today: string) {
  const ok = (r: WatchArrival) => !isSensitiveTaxon([r.sci, r.sci.split(" ")[0]]);
  const arrivals = await sql<WatchArrival[]>`
    SELECT p.scientific_name AS sci, p.vernacular_name AS name, p.arrival_week::text AS week, p.total_n AS n
    FROM phenology p JOIN species_group g USING (scientific_name)
    WHERE p.cell_lat = ${cellLat} AND p.cell_lon = ${cellLon} AND g.is_species AND g.grp = 'avian' AND COALESCE(p.arrival_support, 1) >= 0.5`;
  const candidates = await sql<WatchArrival[]>`
    SELECT c.scientific_name AS sci, c.vernacular_name AS name, c.week::text AS week, c.n
    FROM arrival_candidates c JOIN species_group g USING (scientific_name)
    WHERE c.cell_lat = ${cellLat} AND c.cell_lon = ${cellLon} AND g.is_species AND g.grp = 'avian'`;
  return watchDigest(arrivals.filter(ok), candidates.filter(ok), today);
}

/** Sends this week's migration watch to every confirmed subscription that has not had one this week and has news. */
export async function sendWatches(budgetMs = 60_000): Promise<{ checked: number; sent: number }> {
  const t0 = Date.now();
  if (!ALERTS_ENABLED) return { checked: 0, sent: 0 };
  const monday = thisMonday(), today = new Date().toISOString().slice(0, 10);
  const subs = await sql<{ id: number; email_enc: string; token: string; place: string; cell_lat: number; cell_lon: number }[]>`
    SELECT id, email_enc, token, place, cell_lat, cell_lon FROM alert_subs
    WHERE scientific_name = ${WATCH_MARK} AND confirmed_at IS NOT NULL AND (last_alert_week IS NULL OR last_alert_week < ${monday})`;
  const cache = new Map<string, Awaited<ReturnType<typeof cellDigest>>>();
  let sent = 0;
  for (const s of subs) {
    if (Date.now() - t0 > budgetMs) break;
    const key = `${s.cell_lat},${s.cell_lon}`;
    if (!cache.has(key)) cache.set(key, await cellDigest(s.cell_lat, s.cell_lon, today));
    const d = cache.get(key)!;
    if (!worthSending(d)) { await sql`UPDATE alert_subs SET last_alert_week = ${monday} WHERE id = ${s.id}`; continue; }
    const to = tryDecrypt(s.email_enc);
    if (!to) continue;
    const item = (x: { sci: string; name: string | null; date: string; possible?: true }) =>
      ({ name: x.name ?? x.sci, url: `${SITE}/species/${speciesSlug(x.sci)}`, date: fmtWeek(x.date), possible: x.possible });
    const arrived = d.arrived.map(item), due = d.due.map(item);
    const text = [
      `Migration watch for ${s.place}, week of ${fmtWeek(monday)} (the wider area, about 550 km across).`,
      arrived.length ? `\nArrived lately:\n${arrived.map((x) => `- ${x.name}${x.possible ? " (possibly arriving)" : ""}, week of ${x.date}: ${x.url}`).join("\n")}` : "",
      due.length ? `\nDue in the next three weeks:\n${due.map((x) => `- ${x.name}, last year around ${x.date}: ${x.url}`).join("\n")}` : "",
      `\nGuess the next arrival: ${SITE}/guess\nYour patch: ${SITE}/patch`,
      `\nDates come from recording stations and open records, by week, and automatic identification makes mistakes. You get this email only in weeks with news.\nStop these emails: ${unsubscribeUrl(s.token)}`,
    ].filter(Boolean).join("\n");
    const ok = await sendMail("watch", to, `Migration watch: ${arrived.length ? `${arrived[0].name}${arrived.length > 1 ? ` and ${arrived.length - 1} more` : ""} near ${s.place}` : `due soon near ${s.place}`}`,
      text, oneClickUrl(s.token), watchHtml({ place: s.place, week: fmtWeek(monday), arrived, due, guessUrl: `${SITE}/guess`, patchUrl: `${SITE}/patch`, unsubscribeUrl: unsubscribeUrl(s.token) }));
    if (!ok) break; // daily cap or mail error: the rest go out on the next run this week
    await sql`UPDATE alert_subs SET last_alert_at = now(), last_alert_week = ${monday} WHERE id = ${s.id}`;
    sent++;
  }
  return { checked: subs.length, sent };
}
