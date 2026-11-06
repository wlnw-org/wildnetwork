import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { gbifJson } from "@/lib/gbif";
import { GROUPS, GRP, UPLOAD_CHECK, minAcousticWeek } from "@/lib/methods";
import { MAINTAINER } from "@/lib/projects";
import { sendMail } from "@/lib/alerts";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { SITE } from "@/lib/site";
import { STORAGE, databaseMb } from "@/lib/storage";
import type { UploadRow } from "@/lib/uploadParse";

/**
 * Contributed datasets (methods 0.21). A researcher signed in with ORCID describes a dataset, uploads its detection
 * tables, and submits it. Records are checked (names against the GBIF backbone, range, season, bursts) and stay out of
 * every measure until the dataset is live. Live records are added to the weekly counts as source 'upload'. Every dataset
 * has its own page, citation and download, and is credited wherever its records are used.
 */
export const DATASET_LIMITS = { PER_OWNER: 20, MAX_RECORDS: 300_000, CHUNK: 2000, NAMES_PER_CALL: 200, TITLE: 160, TEXT: 3000, PEOPLE: 20 };
export const LICENSES: Record<string, string> = { "CC0-1.0": "CC0", "CC-BY-4.0": "CC BY 4.0", "CC-BY-NC-4.0": "CC BY-NC 4.0" };
export const LICENSE_URL: Record<string, string> = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-NC-4.0": "https://creativecommons.org/licenses/by-nc/4.0/",
};
export const PRECISIONS = [1, 10, 25, 50];
/** Records that count: passed the checks, confirmed by a reviewer, or in an area too thin to judge. */
export const INCLUDED = ["passed", "unchecked", "confirmed"];
export const UPLOAD_SOURCE = "upload";

export interface Person { name: string; orcid?: string }
export interface Dataset {
  id: string; owner: string; title: string; institution: string | null; description: string | null; people: Person[];
  license: string; grp: string; method: "machine" | "human"; device: string | null; classifier: string | null; min_conf: number;
  precision_km: number; status: "draft" | "review" | "live" | "withdrawn"; doi: string | null; records: number; species: number;
  sites: number; first_day: string | null; last_day: string | null; checks: Checks | null; review_note: string | null;
  downloads: number; created_at: string; live_at: string | null;
}
export interface Checks { at: string; total: number; passed: number; unchecked: number; flagged: number; confirmed: number; rejected: number; reasons: Record<string, number>; warnings: string[] }

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
export const isReviewer = (orcid: string | undefined) =>
  !!orcid && (orcid === MAINTAINER.orcid || (process.env.DATASET_REVIEWERS ?? "").split(",").map((s) => s.trim()).includes(orcid));

export function newDatasetId(title: string): string {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 48).replace(/-$/, "");
  return `${slug || "dataset"}-${randomBytes(3).toString("hex")}`;
}

export function cleanPeople(v: unknown): Person[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, DATASET_LIMITS.PEOPLE).map((p) => ({
    name: String((p as Person)?.name ?? "").trim().slice(0, 120),
    orcid: ORCID_RE.test(String((p as Person)?.orcid ?? "").trim()) ? String((p as Person).orcid).trim() : undefined,
  })).filter((p) => p.name);
}

export async function getDataset(id: string): Promise<Dataset | null> {
  const [d] = await sql<Dataset[]>`SELECT *, first_day::text, last_day::text, created_at::text, live_at::text FROM datasets WHERE id = ${id}`;
  return d ?? null;
}
export const canManage = (d: Dataset, orcid: string | undefined) => !!orcid && (d.owner === orcid || isReviewer(orcid));

/** "A. Name, B. Name (2026). Title. Institution. Wildlife Network. https://wlnw.org/datasets/<id>" plus the DOI when there is one. */
export function citation(d: Pick<Dataset, "id" | "title" | "institution" | "people" | "doi" | "live_at" | "created_at">): string {
  const year = (d.live_at ?? d.created_at ?? new Date().toISOString()).slice(0, 4);
  const who = d.people.map((p) => p.name).join(", ") || d.institution || "Unknown";
  const where = d.doi ? `https://doi.org/${d.doi}` : `${SITE}/datasets/${d.id}`;
  return `${who} (${year}). ${d.title}.${d.institution ? ` ${d.institution}.` : ""} Wildlife Network. ${where}`;
}

const GRP_OF = (cls: string | null, order: string | null) =>
  order === "Chiroptera" ? "bat" : cls === "Aves" ? "avian" : cls === "Amphibia" ? "amphibian" : cls === "Insecta" ? "insect" : cls === "Mammalia" ? "mammal" : "other";

export interface NameMatch { input: string; scientificName: string | null; rank: string | null; grp: string | null }

/** Matches names against the GBIF backbone, cached in name_check. Only species, subspecies and genus matches are accepted. */
export async function matchNames(names: string[]): Promise<NameMatch[]> {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, DATASET_LIMITS.NAMES_PER_CALL);
  if (!uniq.length) return [];
  const known = new Map((await sql<{ input_name: string; scientific_name: string | null; rank: string | null; class_name: string | null; order_name: string | null }[]>`
    SELECT input_name, scientific_name, rank, class_name, order_name FROM name_check WHERE input_name = ANY(${uniq})`).map((r) => [r.input_name, r]));
  const todo = uniq.filter((n) => !known.has(n));
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(async (input) => {
      let row = { input_name: input, scientific_name: null as string | null, rank: null as string | null, class_name: null as string | null, order_name: null as string | null, match_type: "NONE" };
      try {
        const m = await gbifJson<{ matchType?: string; confidence?: number; rank?: string; canonicalName?: string; species?: string; class?: string; order?: string; status?: string }>(
          "/species/match", new URLSearchParams({ name: input, verbose: "false" }), 2);
        const ok = m.matchType && m.matchType !== "NONE" && m.matchType !== "HIGHERRANK" && (m.confidence ?? 0) >= 90 && ["SPECIES", "SUBSPECIES", "GENUS"].includes(m.rank ?? "");
        // Synonyms resolve to the accepted species; a subspecies is counted as its species.
        if (ok) row = { ...row, scientific_name: m.rank === "GENUS" ? m.canonicalName ?? null : m.species ?? m.canonicalName ?? null, rank: m.rank ?? null, class_name: m.class ?? null, order_name: m.order ?? null, match_type: m.matchType! };
      } catch { return; /* GBIF unreachable: try again next time, nothing cached */ }
      await sql`INSERT INTO name_check ${sql(row)} ON CONFLICT (input_name) DO UPDATE SET scientific_name = EXCLUDED.scientific_name, rank = EXCLUDED.rank,
        class_name = EXCLUDED.class_name, order_name = EXCLUDED.order_name, match_type = EXCLUDED.match_type, checked_at = now()`;
      known.set(input, row);
    }));
  }
  return uniq.map((input) => {
    const k = known.get(input);
    return { input, scientificName: k?.scientific_name ?? null, rank: k?.rank ?? null, grp: k?.scientific_name ? GRP_OF(k.class_name, k.order_name) : null };
  });
}

export class DatasetError extends Error {}

/** Adds checked rows to a draft. Names must already be matched (rename maps an unmatched name to one the uploader chose). */
export async function addRecords(d: Dataset, rows: UploadRow[], rename: Record<string, string>): Promise<{ added: number; duplicates: number; unmatched: number }> {
  if (d.status !== "draft") throw new DatasetError("Records can only be added while the dataset is a draft.");
  if ((await databaseMb()) > STORAGE.WARN_MB) throw new DatasetError("Uploads are paused while the database is nearly full. Please try again in a few days.");
  if (d.records + rows.length > DATASET_LIMITS.MAX_RECORDS) throw new DatasetError(`A dataset can hold up to ${DATASET_LIMITS.MAX_RECORDS.toLocaleString("en")} records. Please split it.`);
  const names = rows.map((r) => (rename[r.name] ?? r.name).trim());
  const matches = new Map((await matchNames(names)).map((m) => [m.input, m]));
  let unmatched = 0;
  const clean = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], m = matches.get(names[i]);
    const ts = Date.parse(r.ts);
    if (!m?.scientificName || !Number.isFinite(ts) || !Number.isFinite(r.lat) || !Number.isFinite(r.lon) || Math.abs(r.lat) > 90 || Math.abs(r.lon) > 180) { unmatched++; continue; }
    clean.push({
      dataset_id: d.id, site: String(r.site ?? "").slice(0, 80) || `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`, lat: r.lat, lon: r.lon, ts: new Date(ts),
      scientific_name: m.scientificName, confidence: r.confidence === null || !Number.isFinite(r.confidence) ? null : Math.max(0, Math.min(1, r.confidence)),
      individuals: Math.max(1, Math.min(10_000, Math.round(r.count || 1))), file_name: r.file ? String(r.file).slice(0, 160) : null,
    });
  }
  let added = 0;
  for (let i = 0; i < clean.length; i += 1000) {
    const res = await sql`INSERT INTO dataset_records ${sql(clean.slice(i, i + 1000))} ON CONFLICT DO NOTHING`;
    added += res.count;
  }
  // Species first met here get their class, so effort is counted in the right group.
  const groups = [...new Map([...matches.values()].filter((m) => m.scientificName).map((m) => [m.scientificName!, m.grp ?? d.grp])).entries()];
  if (groups.length) await sql`INSERT INTO species_group (scientific_name, grp, is_species)
    SELECT n, g, position(' ' in n) > 0 FROM unnest(${groups.map((g) => g[0])}::text[], ${groups.map((g) => g[1])}::text[]) AS x(n, g) ON CONFLICT (scientific_name) DO NOTHING`;
  await refreshStats(d.id);
  return { added, duplicates: clean.length - added, unmatched };
}

async function refreshStats(id: string): Promise<void> {
  await sql`UPDATE datasets SET updated_at = now(), (records, species, sites, first_day, last_day) = (
    SELECT COUNT(*)::int, COUNT(DISTINCT scientific_name)::int, COUNT(DISTINCT site)::int, MIN(ts)::date, MAX(ts)::date FROM dataset_records WHERE dataset_id = ${id}) WHERE id = ${id}`;
}

const cellExpr = (v: string) => sql`(FLOOR(${sql(v)} / 5) * 5)::int`;

/** Runs every automatic check again on a dataset's records. Reviewer decisions (confirmed, rejected) are kept. */
export async function runChecks(d: Dataset): Promise<Checks> {
  await sql`UPDATE dataset_records SET verification = 'unchecked', flag = NULL WHERE dataset_id = ${d.id} AND verification IN ('passed', 'flagged', 'unchecked')`;
  // 1. Bursts: a test playback or a stuck classifier gives hundreds of detections a minute.
  await sql`UPDATE dataset_records r SET verification = 'flagged', flag = ${`burst: over ${UPLOAD_CHECK.BURST_PER_MINUTE} detections in one minute at this site`}
    FROM (SELECT site, date_trunc('minute', ts) AS m FROM dataset_records WHERE dataset_id = ${d.id} GROUP BY 1, 2 HAVING COUNT(*) > ${UPLOAD_CHECK.BURST_PER_MINUTE}) b
    WHERE r.dataset_id = ${d.id} AND r.site = b.site AND date_trunc('minute', r.ts) = b.m AND r.verification = 'unchecked'`;
  // 2. Range: species that GBIF has almost never recorded around a well surveyed cell (src/lib/range.ts).
  await sql`UPDATE dataset_records r SET verification = 'flagged', flag = 'outside the known range'
    FROM range_outliers o WHERE r.dataset_id = ${d.id} AND r.verification = 'unchecked' AND o.scientific_name = r.scientific_name
      AND o.cell_lat = ${cellExpr("r.lat")} AND o.cell_lon = ${cellExpr("r.lon")}`;
  // 3. Season: recorded nearby around this time of year by another source, when the area is watched enough to say.
  const combos = await sql<{ sp: string; cl: number; cn: number; w: number; grp: string }[]>`
    SELECT r.scientific_name AS sp, ${cellExpr("r.lat")} AS cl, ${cellExpr("r.lon")} AS cn, EXTRACT(WEEK FROM r.ts)::int AS w,
           COALESCE(g.grp, ${d.grp}) AS grp
    FROM dataset_records r LEFT JOIN species_group g USING (scientific_name)
    WHERE r.dataset_id = ${d.id} AND r.verification = 'unchecked' GROUP BY 1, 2, 3, 4, 5`;
  if (combos.length) {
    const lats = [...new Set(combos.flatMap((c) => [c.cl - 5, c.cl, c.cl + 5]))], lons = [...new Set(combos.flatMap((c) => [c.cn - 5, c.cn, c.cn + 5]))];
    const species = [...new Set(combos.map((c) => c.sp))];
    const [effort, seen] = await Promise.all([
      sql<{ cell_lat: number; cell_lon: number; grp: string; w: number; n: number }[]>`
        SELECT cell_lat, cell_lon, grp, EXTRACT(WEEK FROM week)::int AS w, SUM(detections)::float AS n FROM effort_weekly_source
        WHERE source_system <> ${UPLOAD_SOURCE} AND cell_lat = ANY(${lats}::int[]) AND cell_lon = ANY(${lons}::int[]) GROUP BY 1, 2, 3, 4`,
      sql<{ scientific_name: string; cell_lat: number; cell_lon: number; w: number }[]>`
        SELECT DISTINCT scientific_name, cell_lat, cell_lon, EXTRACT(WEEK FROM week)::int AS w FROM species_weekly
        WHERE source_system <> ${UPLOAD_SOURCE} AND scientific_name = ANY(${species}) AND cell_lat = ANY(${lats}::int[]) AND cell_lon = ANY(${lons}::int[])`,
    ]);
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 53 - Math.abs(a - b)) <= UPLOAD_CHECK.WEEK_WINDOW;
    const close = (cl: number, cn: number, x: { cell_lat: number; cell_lon: number }) => Math.abs(x.cell_lat - cl) <= 5 && Math.abs(x.cell_lon - cn) <= 5;
    const verdict = combos.map((c) => {
      if (seen.some((s) => s.scientific_name === c.sp && close(c.cl, c.cn, s) && near(s.w, c.w))) return "passed";
      const e = effort.filter((x) => x.grp === c.grp && close(c.cl, c.cn, x) && near(x.w, c.w)).reduce((s, x) => s + x.n, 0);
      return e >= minAcousticWeek(c.grp) * UPLOAD_CHECK.MIN_EFFORT_FACTOR ? "flagged" : "unchecked";
    });
    const pick = (v: string) => combos.filter((_, i) => verdict[i] === v);
    for (const [v, flag] of [["passed", null], ["flagged", "not recorded nearby at this time of year"]] as const) {
      const list = pick(v);
      for (let i = 0; i < list.length; i += 2000) {
        const part = list.slice(i, i + 2000);
        await sql`UPDATE dataset_records r SET verification = ${v}, flag = ${flag}
          FROM unnest(${part.map((c) => c.sp)}::text[], ${part.map((c) => c.cl)}::int[], ${part.map((c) => c.cn)}::int[], ${part.map((c) => c.w)}::int[]) AS x(sp, cl, cn, w)
          WHERE r.dataset_id = ${d.id} AND r.verification = 'unchecked' AND r.scientific_name = x.sp
            AND ${cellExpr("r.lat")} = x.cl AND ${cellExpr("r.lon")} = x.cn AND EXTRACT(WEEK FROM r.ts)::int = x.w`;
      }
    }
  }
  const counts = await sql<{ verification: string; flag: string | null; n: number }[]>`
    SELECT verification, flag, COUNT(*)::int AS n FROM dataset_records WHERE dataset_id = ${d.id} GROUP BY 1, 2`;
  const sum = (v: string) => counts.filter((c) => c.verification === v).reduce((s, c) => s + c.n, 0);
  const reasons: Record<string, number> = {};
  for (const c of counts) if (c.verification === "flagged" && c.flag) reasons[c.flag] = (reasons[c.flag] ?? 0) + c.n;
  const warnings: string[] = [];
  const dominant = await sql<{ site: string; scientific_name: string; share: number; n: number }[]>`
    SELECT site, scientific_name, n::int, (n / total)::float AS share FROM (
      SELECT site, scientific_name, COUNT(*)::float AS n, SUM(COUNT(*)) OVER (PARTITION BY site) AS total
      FROM dataset_records WHERE dataset_id = ${d.id} GROUP BY 1, 2) s WHERE total >= 500 AND n / total > 0.95`;
  for (const x of dominant) warnings.push(`${Math.round(x.share * 100)}% of the records at "${x.site}" are ${x.scientific_name}: worth checking for a noise source or a repeated false positive.`);
  const checks: Checks = { at: new Date().toISOString(), total: counts.reduce((s, c) => s + c.n, 0), passed: sum("passed"), unchecked: sum("unchecked"), flagged: sum("flagged"), confirmed: sum("confirmed"), rejected: sum("rejected"), reasons, warnings };
  await sql`UPDATE datasets SET checks = ${sql.json(checks as never)}, updated_at = now() WHERE id = ${d.id}`;
  return checks;
}

/** Submit a draft: run the checks, then go live (trusted contributors with few flags) or wait for a reviewer. */
export async function submit(d: Dataset): Promise<"live" | "review"> {
  if (d.status !== "draft") throw new DatasetError("Only a draft can be submitted.");
  if (!d.records) throw new DatasetError("Upload some records first.");
  const checks = await runChecks(d);
  const [c] = await sql<{ clean_datasets: number }[]>`SELECT clean_datasets FROM contributors WHERE orcid = ${d.owner}`;
  const trusted = isReviewer(d.owner) || (c?.clean_datasets ?? 0) >= UPLOAD_CHECK.TRUSTED_AFTER;
  if (trusted && checks.flagged / Math.max(1, checks.total) <= UPLOAD_CHECK.AUTO_LIVE_MAX_FLAGGED) {
    await goLive(d.id);
    return "live";
  }
  await sql`UPDATE datasets SET status = 'review', review_note = NULL, updated_at = now() WHERE id = ${d.id}`;
  await sendMail("dataset-review", MAINTAINER.email, `Dataset to review: ${d.title}`,
    `${d.title}\n${d.records} records, ${d.species} species, ${checks.flagged} flagged.\n\n${SITE}/datasets/${d.id}`).catch(() => false);
  return "review";
}

export async function goLive(id: string): Promise<void> {
  const [d] = await sql<{ owner: string; status: string }[]>`UPDATE datasets SET status = 'live', live_at = COALESCE(live_at, now()), review_note = NULL, updated_at = now()
    WHERE id = ${id} RETURNING owner, status`;
  if (!d) return;
  await sql`INSERT INTO contributors (orcid, clean_datasets) VALUES (${d.owner}, 1)
    ON CONFLICT (orcid) DO UPDATE SET clean_datasets = contributors.clean_datasets + 1, updated_at = now()`;
  await rollupDataset(id);
}

/** Back to draft (to add records or after a reviewer's note): its records leave every measure until it is live again. */
export async function reopen(id: string, note: string | null = null): Promise<void> {
  const pairs = await pairsOf(id);
  await sql`UPDATE datasets SET status = 'draft', review_note = ${note}, updated_at = now() WHERE id = ${id}`;
  await rollupPairs(pairs);
}

/** Withdrawal deletes the dataset and every record, and takes them out of the weekly counts. */
export async function withdraw(id: string): Promise<void> {
  const pairs = await pairsOf(id);
  await sql`DELETE FROM datasets WHERE id = ${id}`;
  await rollupPairs(pairs);
}

/** Reviewer (or owner, for rejection) decision on all flagged records of one species at one site. */
export async function decide(d: Dataset, species: string, site: string, status: "confirmed" | "rejected"): Promise<number> {
  const res = await sql`UPDATE dataset_records SET verification = ${status} WHERE dataset_id = ${d.id} AND scientific_name = ${species} AND site = ${site} AND verification = 'flagged'`;
  if (d.status === "live") await rollupDataset(d.id);
  return res.count;
}

type Pair = { week: string; lat: number; lon: number };
async function pairsOf(id: string): Promise<Pair[]> {
  return sql<Pair[]>`SELECT DISTINCT date_trunc('week', ts)::date::text AS week, ${cellExpr("lat")} AS lat, ${cellExpr("lon")} AS lon FROM dataset_records WHERE dataset_id = ${id}`;
}
export async function rollupDataset(id: string): Promise<void> { await rollupPairs(await pairsOf(id)); }

/** Rebuilds the 'upload' weekly counts and the effort for the given weeks and cells, from every live dataset. */
async function rollupPairs(pairs: Pair[]): Promise<void> {
  for (let i = 0; i < pairs.length; i += 1000) {
    const p = pairs.slice(i, i + 1000);
    const P = (t: typeof sql) => t`unnest(${p.map((x) => x.week)}::date[], ${p.map((x) => x.lat)}::int[], ${p.map((x) => x.lon)}::int[]) AS p(week, lat, lon)`;
    await sql.begin(async (tx) => {
      const T = tx as unknown as typeof sql;
      await tx`DELETE FROM species_weekly s USING ${P(T)} WHERE s.source_system = ${UPLOAD_SOURCE} AND s.week = p.week AND s.cell_lat = p.lat AND s.cell_lon = p.lon`;
      await tx`
        INSERT INTO species_weekly (week, source_system, scientific_name, vernacular_name, cell_lat, cell_lon, count, high_conf_count)
        SELECT w.week, ${UPLOAD_SOURCE}, w.scientific_name, (SELECT x.vernacular_name FROM species_weekly x WHERE x.scientific_name = w.scientific_name AND x.vernacular_name IS NOT NULL LIMIT 1),
               w.lat, w.lon, w.n, w.hi
        FROM (SELECT date_trunc('week', r.ts)::date AS week, r.scientific_name, ${cellExpr("r.lat")} AS lat, ${cellExpr("r.lon")} AS lon,
                     COUNT(*)::int AS n, (COUNT(*) FILTER (WHERE r.confidence >= 0.85 OR r.confidence IS NULL))::int AS hi
              FROM dataset_records r JOIN datasets d ON d.id = r.dataset_id AND d.status = 'live'
              WHERE r.verification = ANY(${INCLUDED}) GROUP BY 1, 2, 3, 4) w
        JOIN ${P(T)} ON w.week = p.week AND w.lat = p.lat AND w.lon = p.lon`;
      await tx`DELETE FROM effort_weekly e USING ${P(T)} WHERE e.week = p.week AND e.cell_lat = p.lat AND e.cell_lon = p.lon`;
      await tx`DELETE FROM effort_weekly_source e USING ${P(T)} WHERE e.week = p.week AND e.cell_lat = p.lat AND e.cell_lon = p.lon`;
      await tx`
        INSERT INTO effort_weekly (week, cell_lat, cell_lon, grp, detections, species)
        SELECT s.week, s.cell_lat, s.cell_lon, ${GRP()}, SUM(s.count), COUNT(DISTINCT s.scientific_name)
        FROM species_weekly s JOIN ${P(T)} ON s.week = p.week AND s.cell_lat = p.lat AND s.cell_lon = p.lon
        LEFT JOIN species_group g USING (scientific_name) GROUP BY 1, 2, 3, 4`;
      await tx`
        INSERT INTO effort_weekly_source (week, cell_lat, cell_lon, grp, source_system, detections, species)
        SELECT s.week, s.cell_lat, s.cell_lon, ${GRP()}, s.source_system, SUM(s.count), COUNT(DISTINCT s.scientific_name)
        FROM species_weekly s JOIN ${P(T)} ON s.week = p.week AND s.cell_lat = p.lat AND s.cell_lon = p.lon
        LEFT JOIN species_group g USING (scientific_name) GROUP BY 1, 2, 3, 4, 5`;
    });
  }
}

export interface Credit { id: string; title: string; institution: string | null; records: number }
/** Live datasets behind a species (anywhere) or a 5 degree cell, most records first. */
export async function credits(o: { species?: string; cell?: { lat: number; lon: number } }): Promise<Credit[]> {
  const where = o.species ? sql`r.scientific_name = ${o.species}`
    : o.cell ? sql`r.lat >= ${o.cell.lat} AND r.lat < ${o.cell.lat + 5} AND r.lon >= ${o.cell.lon} AND r.lon < ${o.cell.lon + 5}` : sql`false`;
  return sql<Credit[]>`
    SELECT d.id, d.title, d.institution, COUNT(*)::int AS records FROM dataset_records r JOIN datasets d ON d.id = r.dataset_id AND d.status = 'live'
    WHERE ${where} AND r.verification = ANY(${INCLUDED}) GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20`.catch(() => []);
}

/** Records as Darwin Core style CSV: coordinates rounded to the precision the owner chose, sensitive taxa to 1 degree. */
export async function exportCsv(d: Dataset): Promise<string> {
  const rows = await sql<{ id: string; site: string; lat: number; lon: number; ts: string; scientific_name: string; confidence: number | null; individuals: number; verification: string }[]>`
    SELECT id::text, site, lat, lon, ts::text, scientific_name, confidence, individuals, verification FROM dataset_records
    WHERE dataset_id = ${d.id} AND verification = ANY(${INCLUDED}) ORDER BY ts`;
  const status: Record<string, string> = { passed: "passed automatic checks", unchecked: "unverified", confirmed: "verified by expert" };
  const q = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["occurrenceID", "datasetID", "datasetName", "institutionCode", "rightsHolder", "recordedBy", "license", "basisOfRecord", "eventDate",
    "scientificName", "decimalLatitude", "decimalLongitude", "coordinateUncertaintyInMeters", "individualCount", "identificationVerificationStatus", "locationID", "confidence"];
  const people = d.people.map((p) => p.name).join(" | ");
  const lines = [`# ${citation(d)}. Licence ${LICENSES[d.license]} (${LICENSE_URL[d.license]}).`, head.join(",")];
  for (const r of rows) {
    const sensitive = isSensitiveTaxon([r.scientific_name]);
    const step = sensitive ? 1 : d.precision_km / 111;
    const round = (v: number) => (Math.floor(v / step) * step + step / 2).toFixed(step >= 1 ? 1 : 3);
    lines.push([`${SITE}/datasets/${d.id}#${r.id}`, d.id, d.title, d.institution, d.institution ?? people, people, LICENSE_URL[d.license],
      d.method === "human" ? "HumanObservation" : "MachineObservation", new Date(r.ts).toISOString(), r.scientific_name, round(r.lat), round(r.lon),
      Math.round((sensitive ? 111 : d.precision_km) * 1000 * 0.71), r.individuals, status[r.verification] ?? r.verification, sensitive ? "" : r.site,
      r.confidence ?? ""].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Validates the editable fields of a dataset; shared with the [id] route. */
export function datasetFields(b: Record<string, unknown>) {
  const str = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max) || null;
  const title = str("title", DATASET_LIMITS.TITLE);
  if (!title || title.length < 5) return { error: "Please give the dataset a title." } as const;
  const license = String(b.license ?? "");
  if (!LICENSES[license]) return { error: "Please choose a licence." } as const;
  const grp = String(b.grp ?? "avian");
  if (!(GROUPS as readonly string[]).includes(grp)) return { error: "Unknown animal group." } as const;
  const method = b.method === "human" ? "human" : "machine";
  const minConf = Number(b.minConf ?? 0.8);
  if (!(minConf >= 0.1 && minConf <= 1)) return { error: "The confidence cut-off must be between 0.1 and 1." } as const;
  const precision = Number(b.precisionKm ?? 10);
  const doi = str("doi", 200)?.replace(/^https?:\/\/(dx\.)?doi\.org\//, "") ?? null;
  if (doi && !/^10\.\d{4,}\/\S+$/.test(doi)) return { error: "That DOI does not look right (10.xxxx/...)." } as const;
  return {
    title, license, grp, method, min_conf: minConf, precision_km: PRECISIONS.includes(precision) ? precision : 10, doi,
    institution: str("institution", 200), description: str("description", DATASET_LIMITS.TEXT),
    device: str("device", 200), classifier: str("classifier", 200), people: cleanPeople(b.people),
  };
}
