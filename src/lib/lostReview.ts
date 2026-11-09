// Private review of held lost species records (src/lib/lost.ts). Reviewers: the maintainer, plus ORCID iDs in env
// LOST_REVIEWERS (comma separated). Verdicts: likely wrong, needs checking, worth investigating. A verdict never
// publishes anything; announcing a possible rediscovery is a separate, later step after Re:wild has been told.
import { sql } from "@/lib/db";
import { sendMail } from "@/lib/alerts";
import { MAINTAINER } from "@/lib/projects";

export const VERDICTS = ["likely_wrong", "needs_checking", "worth_investigating"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABEL: Record<Verdict, string> = { likely_wrong: "Likely wrong", needs_checking: "Needs checking", worth_investigating: "Worth investigating" };

export function isLostReviewer(orcid: string | null | undefined): boolean {
  if (!orcid) return false;
  return orcid === MAINTAINER.orcid || (process.env.LOST_REVIEWERS ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(orcid);
}

export interface LostFlag {
  id: number; kind: "record" | "count"; scientific_name: string; common_name: string | null; class_name: string | null; red_list: string | null;
  countries: string | null; region: string | null; name_received: string; source_system: string; source_record: string | null; source_url: string | null;
  observed_at: Date | null; period: string | null; latitude: number | null; longitude: number | null; count: number | null; confidence: number | null;
  media_type: string | null; media_url: string | null; detail: Record<string, unknown>; first_seen: Date; last_seen: Date;
  verdict: Verdict | null; note: string | null; hide_area: boolean; reviewed_by: string | null; reviewed_at: Date | null;
  rewild_sent_at: Date | null;
}

export async function listFlags(limit = 200): Promise<LostFlag[]> {
  return sql<LostFlag[]>`
    SELECT f.id, f.kind, s.scientific_name, s.common_name, s.class_name, s.red_list, s.countries, s.region, f.name_received, f.source_system,
           f.source_record, f.source_url, f.observed_at, f.period, f.latitude, f.longitude, f.count, f.confidence, f.media_type, f.media_url,
           f.detail, f.first_seen, f.last_seen, f.verdict, f.note, f.hide_area, f.reviewed_by, f.reviewed_at, f.rewild_sent_at
    FROM lost_flags f JOIN lost_species s ON s.id = f.lost_id
    ORDER BY (f.verdict IS NULL) DESC, (f.verdict = 'worth_investigating') DESC, f.first_seen DESC LIMIT ${limit}`;
}

export async function setVerdict(id: number, by: string, v: { verdict: Verdict | null; note: string | null; hideArea: boolean }): Promise<boolean> {
  const r = await sql`UPDATE lost_flags SET verdict = ${v.verdict}, note = ${v.note}, hide_area = ${v.hideArea}, reviewed_by = ${by}, reviewed_at = now() WHERE id = ${id}`;
  return r.count === 1;
}

/** Where "worth investigating" records go: env REWILD_CONTACT (one address at Re:wild). Unset = sending is off. */
export const REWILD_CONTACT = process.env.REWILD_CONTACT?.trim() || null;

const SOURCE_NAME: Record<string, string> = { community: "A report sent by a visitor to wlnw.org", inaturalist: "iNaturalist", gbif: "GBIF", obis: "OBIS", orcasound: "Orcasound", acartia: "Acartia" };
const isBirdWeather = (s: string) => s.startsWith("birdweather");

/** The email to Re:wild for one flag. BirdWeather records carry no place or data: we have no agreement to pass them on. */
export function rewildEmail(f: LostFlag): { subject: string; text: string } {
  const name = f.common_name ? `${f.common_name} (${f.scientific_name})` : f.scientific_name;
  const link = f.source_system === "inaturalist" && f.source_record ? `https://www.inaturalist.org/observations/${f.source_record}`
    : f.source_url?.startsWith("/") ? `https://wlnw.org${f.source_url}` : f.source_url;
  const source = f.source_system.startsWith("dataset:") ? "A dataset uploaded to Wildlife Network" : SOURCE_NAME[f.source_system] ?? (isBirdWeather(f.source_system) ? "BirdWeather" : `A recording device (${f.source_system})`);
  const when = f.observed_at ? new Date(f.observed_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : f.period ?? "Unknown";
  const where = isBirdWeather(f.source_system)
    ? "A BirdWeather station. We have no agreement to pass on BirdWeather data or station places, so we can ask BirdWeather to put you in touch with the station owner."
    : f.latitude == null || f.longitude == null ? "Unknown"
    : f.kind === "count" ? `A 5 degree square centred on ${f.latitude.toFixed(1)}, ${f.longitude.toFixed(1)} (a count from an aggregate, no single record)`
    : `${f.latitude.toFixed(4)}, ${f.longitude.toFixed(4)} as received from the source. Please keep this private.`;
  const lines = [
    "Hello,",
    "",
    `Wildlife Network (wlnw.org) watches every record it receives for species on the lost species list. A record of ${name} reached us, and a reviewer marked it as worth investigating. It has not been confirmed, and we have not published it anywhere.`,
    "",
    `Species: ${name}`,
    `Name sent by the source: ${f.name_received}`,
    `Source: ${source}${link && !isBirdWeather(f.source_system) ? `, ${link}` : ""}`,
    `When: ${when}`,
    `Where: ${where}`,
    ...(f.confidence != null && !isBirdWeather(f.source_system) ? [`Model confidence: ${f.confidence.toFixed(2)}`] : []),
    `Photo or recording: ${!isBirdWeather(f.source_system) && f.media_url ? f.media_url : "None that we can share"}`,
    ...(typeof f.detail?.place === "string" ? [`Place, in the reporter's words: ${f.detail.place}`] : []),
    ...(typeof f.detail?.note === "string" ? ["", `What the reporter saw or heard: ${f.detail.note}`] : []),
    ...(f.note ? ["", `Reviewer's note: ${f.note}`] : []),
    "",
    "We will not publish the place of this record. Replying to this email reaches Arun Rajiah directly.",
    "",
    "Arun Rajiah",
    "Wildlife Network, wlnw.org",
  ];
  return { subject: `Possible lost species record to review: ${name}`, text: lines.join("\n") };
}

export async function sendToRewild(id: number, by: string): Promise<"sent" | "not_ready" | "failed"> {
  if (!REWILD_CONTACT) return "not_ready";
  const [f] = await sql<LostFlag[]>`
    SELECT f.id, f.kind, s.scientific_name, s.common_name, s.class_name, s.red_list, s.countries, s.region, f.name_received, f.source_system,
           f.source_record, f.source_url, f.observed_at, f.period, f.latitude, f.longitude, f.count, f.confidence, f.media_type, f.media_url,
           f.detail, f.first_seen, f.last_seen, f.verdict, f.note, f.hide_area, f.reviewed_by, f.reviewed_at, f.rewild_sent_at
    FROM lost_flags f JOIN lost_species s ON s.id = f.lost_id WHERE f.id = ${id}`;
  if (!f || f.verdict !== "worth_investigating" || f.rewild_sent_at) return "not_ready";
  const m = rewildEmail(f);
  const ok = await sendMail("lost-rewild", REWILD_CONTACT, m.subject, m.text, undefined, undefined, { replyTo: MAINTAINER.email, cc: MAINTAINER.email });
  if (!ok) return "failed";
  await sql`UPDATE lost_flags SET rewild_sent_at = now(), rewild_sent_by = ${by} WHERE id = ${id}`;
  return "sent";
}
