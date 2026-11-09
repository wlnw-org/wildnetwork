// Private review of held lost species records (src/lib/lost.ts). Reviewers: the maintainer, plus ORCID iDs in env
// LOST_REVIEWERS (comma separated). Verdicts: likely wrong, needs checking, worth investigating. A verdict never
// publishes anything; announcing a possible rediscovery is a separate, later step after Re:wild has been told.
import { sql } from "@/lib/db";
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
}

export async function listFlags(limit = 200): Promise<LostFlag[]> {
  return sql<LostFlag[]>`
    SELECT f.id, f.kind, s.scientific_name, s.common_name, s.class_name, s.red_list, s.countries, s.region, f.name_received, f.source_system,
           f.source_record, f.source_url, f.observed_at, f.period, f.latitude, f.longitude, f.count, f.confidence, f.media_type, f.media_url,
           f.detail, f.first_seen, f.last_seen, f.verdict, f.note, f.hide_area, f.reviewed_by, f.reviewed_at
    FROM lost_flags f JOIN lost_species s ON s.id = f.lost_id
    ORDER BY (f.verdict IS NULL) DESC, (f.verdict = 'worth_investigating') DESC, f.first_seen DESC LIMIT ${limit}`;
}

export async function setVerdict(id: number, by: string, v: { verdict: Verdict | null; note: string | null; hideArea: boolean }): Promise<boolean> {
  const r = await sql`UPDATE lost_flags SET verdict = ${v.verdict}, note = ${v.note}, hide_area = ${v.hideArea}, reviewed_by = ${by}, reviewed_at = now() WHERE id = ${id}`;
  return r.count === 1;
}
