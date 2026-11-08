import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";

/** Opt-in answers shared from Studio for training open regional classifiers. See drizzle/0037_shared_answers.sql and /privacy#shared-answers. */
export const SHARE = {
  /** Total rows kept (about 3.2 KB each with the embedding), so storage stays well inside the database budget. */
  MAX_ROWS: Number(process.env.SHARE_MAX_ROWS ?? 50_000),
  PER_CONTRIBUTOR_DAY: 5_000,
  BATCH: 200,
  EMBED_MODEL: "perch-2.0",
  EMBED_BYTES: 1536 * 2,
};

export const contributorHash = (key: string) => createHash("sha256").update(`wlnw-share:${key}`).digest("hex");

export interface SharedItem { cid: string; site: string; species: string; label: number; source: string; model: string; confidence?: number | null; lat: number; lon: number; year: number; week: number; embed_model: string; emb: string }

const round = (x: number, step: number) => { const r = Math.round(x / step) * step; return Object.is(r, -0) ? 0 : r; };

/** Checks one item; returns the row to store, or a reason it was refused. */
export function cleanItem(it: SharedItem): { ok: true; row: Record<string, unknown> } | { ok: false; why: string } {
  if (!/^[0-9a-f]{16,64}$/.test(it?.cid ?? "")) return { ok: false, why: "cid" };
  if (!/^[0-9a-f]{8,64}$/.test(it.site ?? "")) return { ok: false, why: "site" };
  const species = (it.species ?? "").trim().replace(/\s+/g, " ");
  if (!/^[A-Z][a-z-]+ [a-z-]+( [a-z-]+)?$/.test(species) || species.length > 120 || /^(Human|Power) /.test(species)) return { ok: false, why: "species" };
  if (it.label !== 0 && it.label !== 1) return { ok: false, why: "label" };
  if (it.source !== "review" && it.source !== "example") return { ok: false, why: "source" };
  if (it.embed_model !== SHARE.EMBED_MODEL) return { ok: false, why: "embed_model" };
  if (![it.lat, it.lon, it.year, it.week].every(Number.isFinite) || Math.abs(it.lat) > 90 || Math.abs(it.lon) > 180) return { ok: false, why: "place" };
  if (it.year < 1990 || it.year > 2100 || it.week < 1 || it.week > 53) return { ok: false, why: "date" };
  const emb = Buffer.from(it.emb ?? "", "base64");
  if (emb.length !== SHARE.EMBED_BYTES) return { ok: false, why: "embedding" };
  const step = isSensitiveTaxon([species, species.split(" ")[0]]) ? 5 : 1;
  const conf = typeof it.confidence === "number" && it.confidence >= 0 && it.confidence <= 1 ? it.confidence : null;
  return { ok: true, row: {
    client_id: it.cid, site: it.site, species, label: it.label, source: it.source, model: String(it.model ?? "").replace(/[^\w.:-]/g, "").slice(0, 40) || "unknown",
    confidence: conf, lat: round(it.lat, step), lon: round(it.lon, step), year: Math.round(it.year), week: Math.round(it.week), embed_model: it.embed_model, embedding: emb,
  } };
}

export async function storeItems(key: string, items: SharedItem[], appVersion: string | null) {
  const who = contributorHash(key);
  const [{ total }] = await sql<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM shared_answers`;
  if (total >= SHARE.MAX_ROWS) return { status: 503, body: { error: "Sharing is paused for now: we have all the answers we can store at the moment. Studio will try again later.", paused: true } };
  const [{ today }] = await sql<{ today: number }[]>`SELECT COUNT(*)::int AS today FROM shared_answers WHERE contributor_hash = ${who} AND created_at > now() - interval '1 day'`;
  if (today + items.length > SHARE.PER_CONTRIBUTOR_DAY) return { status: 429, body: { error: "That is a lot of answers for one day: Studio will send the rest tomorrow.", retryTomorrow: true } };
  const rows: Record<string, unknown>[] = [], refused: Record<string, number> = {};
  for (const it of items) {
    const c = cleanItem(it);
    if (c.ok) rows.push({ ...c.row, contributor_hash: who, app_version: appVersion });
    else refused[c.why] = (refused[c.why] ?? 0) + 1;
  }
  const stored = rows.length ? (await sql`INSERT INTO shared_answers ${sql(rows)} ON CONFLICT (contributor_hash, client_id) DO NOTHING RETURNING 1`).length : 0;
  return { status: 200, body: { received: items.length, stored, duplicates: rows.length - stored, refused } };
}

export async function deleteContributor(key: string): Promise<number> {
  return (await sql`DELETE FROM shared_answers WHERE contributor_hash = ${contributorHash(key)} RETURNING 1`).length;
}

/** Public totals: answers, species, contributors and places, without any per-contributor detail. */
export async function sharedTotals() {
  const [t] = await sql<{ answers: number; species: number; contributors: number; cells: number }[]>`
    SELECT COUNT(*)::int AS answers, COUNT(DISTINCT species)::int AS species, COUNT(DISTINCT contributor_hash)::int AS contributors,
      COUNT(DISTINCT (lat, lon))::int AS cells FROM shared_answers`;
  return t;
}
