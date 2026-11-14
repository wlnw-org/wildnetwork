import { sql } from "@/lib/db";
import { holdCounts } from "@/lib/lost";
import { refreshWeeklyEffort, upsertGroups } from "@/lib/rollups";

/**
 * GBIF occurrence API (https://techdocs.gbif.org/en/openapi/v1/occurrence). Free, keyless, no login.
 * Only records published under CC0 or CC BY 4.0 are used, so every record may be shown and passed on with attribution.
 * GBIF asks that datasets are cited by DOI: see gbif_datasets and /api/v1/sources.
 * The iNaturalist dataset is skipped for live records because those are pulled directly; the weekly history keeps it.
 */
export const GBIF = "https://api.gbif.org/v1";
export const UA = "WildlifeNetwork/0.1 (+https://wlnw.org; https://github.com/wlnw-org/wildnetwork; arunrajiah@gmail.com)";
export const INAT_DATASET = "50c9509d-22c7-4a22-a47d-8c48425ef4a7";
export const CELL = 5;

/**
 * eBird on GBIF is one yearly snapshot, so it stops at the end of its last year (currently early January 2026) and is 15 to 100
 * times bigger than everything else in a cell. Counted in, every autumn would look huge and then collapse, so it is left out.
 */
export const EBIRD_DATASET = "4fa7b334-ce0d-4e88-aaae-2e0c138d049e";
const ebirdWeeks = new Map<string, Promise<boolean>>();
const ebirdInWeek = (week: string, end: string) => {
  if (!ebirdWeeks.has(week)) {
    const p = baseParams();
    p.set("datasetKey", EBIRD_DATASET); p.set("eventDate", `${week},${end}`); p.set("limit", "0");
    ebirdWeeks.set(week, gbifJson<{ count: number }>("/occurrence/search", p).then((j) => j.count > 0).catch((e) => { ebirdWeeks.delete(week); throw e; }));
  }
  return ebirdWeeks.get(week)!;
};

/**
 * Classes pulled, as GBIF taxon keys. Bats are an order inside mammals: a taxon in Chiroptera is 'bat' (checked first),
 * any other mammal is 'mammal' (added 2026-11-15, methods 0.25; camera traps are mostly here).
 */
export const CLASS_TAXA: { key: number; grp: string }[] = [
  { key: 212, grp: "avian" },      // Aves
  { key: 734, grp: "bat" },        // Chiroptera
  { key: 131, grp: "amphibian" },  // Amphibia
  { key: 216, grp: "insect" },     // Insecta
  { key: 359, grp: "mammal" },     // Mammalia (bats stay 'bat': grpOfTaxon checks the order first)
];

/** Query parameters shared by every occurrence request: licence, coordinates, observation records only. */
export function baseParams(): URLSearchParams {
  const p = new URLSearchParams();
  p.append("license", "CC0_1_0");
  p.append("license", "CC_BY_4_0");
  p.set("hasCoordinate", "true");
  p.set("hasGeospatialIssue", "false");
  p.set("occurrenceStatus", "PRESENT");
  for (const b of ["HUMAN_OBSERVATION", "MACHINE_OBSERVATION", "OBSERVATION", "OCCURRENCE"]) p.append("basisOfRecord", b);
  return p;
}

/** GBIF rate limits bursts (429). Retry with backoff; be polite rather than fast. */
export async function gbifJson<T>(path: string, params: URLSearchParams, retries = 6): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GBIF}${path}?${params}`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await new Promise((r) => setTimeout(r, Math.min(60_000, 1500 * 2 ** attempt)));
      continue;
    }
    throw new Error(`gbif ${res.status} ${path}`);
  }
}

export const cellPolygon = (c: { lat: number; lon: number }) =>
  `POLYGON((${c.lon} ${c.lat},${c.lon + CELL} ${c.lat},${c.lon + CELL} ${c.lat + CELL},${c.lon} ${c.lat + CELL},${c.lon} ${c.lat}))`;

const taxa = new Map<number, { scientific_name: string; vernacular_name: string | null; grp: string }>();

/** Species key -> name and class, cached in memory and in gbif_taxa. */
/**
 * English common name: the one most checklists agree on. GBIF's single vernacularName field is often a banding code
 * or another language, so it is not used.
 */
export async function englishName(key: number): Promise<string | null> {
  const v = await gbifJson<{ results: { vernacularName: string; language?: string }[] }>(`/species/${key}/vernacularNames`, new URLSearchParams({ limit: "200" })).catch(() => null);
  const votes = new Map<string, { name: string; n: number }>();
  for (const x of v?.results ?? []) {
    const name = x.vernacularName?.trim();
    if (x.language !== "eng" || !name || name.length < 4 || name === name.toUpperCase() || /[.,;()]/.test(name)) continue;
    const k = name.toLowerCase();
    const e = votes.get(k) ?? { name, n: 0 };
    e.n++; votes.set(k, e);
  }
  const best = [...votes.values()].sort((x, y) => y.n - x.n || x.name.length - y.name.length)[0];
  // Capitalise the first letter of each word only: "Say's Phoebe", "White-throated Sparrow".
  return best ? best.name.replace(/(^|\s)(\w)/g, (_, sp: string, c: string) => sp + c.toUpperCase()) : null;
}

/** Class from GBIF's taxonomy: bats are the order Chiroptera, the rest are classes. */
const grpOfTaxon = (t: { classKey?: number; orderKey?: number }) => (t.orderKey === 734 ? "bat" : CLASS_TAXA.find((c) => c.key === t.classKey)?.grp ?? "other");

export async function resolveTaxa(keys: number[]): Promise<void> {
  const missing = keys.filter((k) => !taxa.has(k));
  if (missing.length) {
    const rows = await sql<{ species_key: number; scientific_name: string; vernacular_name: string | null; grp: string }[]>`
      SELECT species_key, scientific_name, vernacular_name, grp FROM gbif_taxa WHERE species_key IN ${sql(missing)}`;
    for (const r of rows) taxa.set(r.species_key, r);
  }
  const fetchKeys = missing.filter((k) => !taxa.has(k));
  await Promise.all(fetchKeys.map(async (k) => {
    try {
      const s = await gbifJson<{ canonicalName?: string; scientificName: string; vernacularName?: string; classKey?: number; orderKey?: number }>(`/species/${k}`, new URLSearchParams());
      const grp = grpOfTaxon(s);
      const vern = await englishName(k);
      const row = { scientific_name: s.canonicalName ?? s.scientificName, vernacular_name: vern, grp };
      taxa.set(k, row);
      await sql`INSERT INTO gbif_taxa (species_key, scientific_name, vernacular_name, grp) VALUES (${k}, ${row.scientific_name}, ${row.vernacular_name}, ${grp}) ON CONFLICT (species_key) DO NOTHING`;
    } catch { /* unresolved keys are skipped in this run */ }
  }));
}

export const taxon = (k: number) => taxa.get(k);

/**
 * One cell, one week, all classes in one query: species counts straight from GBIF's facet, no records downloaded.
 * Writes species_weekly rows with source_system 'gbif'. Returns rows written.
 */
export async function rollupGbifCellWeek(cell: { lat: number; lon: number }, week: string): Promise<number> {
  const end = new Date(Date.parse(week) + 6 * 86400_000).toISOString().slice(0, 10);
  const p = baseParams();
  for (const c of CLASS_TAXA) p.append("taxonKey", String(c.key));
  p.set("eventDate", `${week},${end}`);
  p.set("geometry", cellPolygon(cell));
  p.set("facet", "speciesKey");
  p.set("facetLimit", "800");
  p.set("limit", "0");
  const j = await gbifJson<{ count: number; facets: { field: string; counts: { name: string; count: number }[] }[] }>("/occurrence/search", p);
  let counts = j.facets?.[0]?.counts ?? [];
  if (!counts.length) return 0;
  if (await ebirdInWeek(week, end)) {
    p.set("datasetKey", EBIRD_DATASET);
    const e = await gbifJson<{ facets: { counts: { name: string; count: number }[] }[] }>("/occurrence/search", p);
    const minus = new Map((e.facets?.[0]?.counts ?? []).map((x) => [x.name, x.count]));
    counts = counts.map((x) => ({ ...x, count: x.count - (minus.get(x.name) ?? 0) })).filter((x) => x.count > 0);
    if (!counts.length) return 0;
  }
  await resolveTaxa(counts.map((x) => Number(x.name)));
  const rows = counts.flatMap((x) => {
    const t = taxon(Number(x.name));
    return t ? [{ week, source_system: "gbif", scientific_name: t.scientific_name, vernacular_name: t.vernacular_name, cell_lat: cell.lat, cell_lon: cell.lon, count: x.count, high_conf_count: x.count, grp: t.grp }] : [];
  });
  if (!rows.length) return 0;
  // Two GBIF keys can share one canonical name (synonyms, subspecies): merge them so a row is written once.
  const merged = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const m = merged.get(r.scientific_name);
    if (m) { m.count += r.count; m.high_conf_count += r.high_conf_count; m.vernacular_name ??= r.vernacular_name; } else merged.set(r.scientific_name, { ...r });
  }
  rows.length = 0; rows.push(...merged.values());
  await upsertGroups(rows.map((r) => ({ name: r.scientific_name, grp: r.grp })));
  // Lost species are held for private review, never written to the public rollups (src/lib/lost.ts).
  const out = await holdCounts(rows.map((r) => ({ week: r.week, source_system: r.source_system, scientific_name: r.scientific_name, vernacular_name: r.vernacular_name, cell_lat: r.cell_lat, cell_lon: r.cell_lon, count: r.count, high_conf_count: r.high_conf_count })),
    "gbif", (r) => `week ${r.week}`, (r) => ({ lat: r.cell_lat + CELL / 2, lon: r.cell_lon + CELL / 2 }));
  if (!out.length) return 0;
  await sql`
    INSERT INTO species_weekly ${sql(out)}
    ON CONFLICT (week, source_system, scientific_name, cell_lat, cell_lon) DO UPDATE SET
      count = EXCLUDED.count, high_conf_count = EXCLUDED.high_conf_count, vernacular_name = COALESCE(EXCLUDED.vernacular_name, species_weekly.vernacular_name)`;
  return out.length;
}

/** Cells with at least 10 licensed bird records in the last 90 days. About 2,000 count-only queries; refreshed when older than 30 days. */
export async function gbifCells(force = false): Promise<{ lat: number; lon: number }[]> {
  const have = await sql<{ cell_lat: number; cell_lon: number; age: number }[]>`SELECT cell_lat, cell_lon, EXTRACT(EPOCH FROM now() - checked_at) AS age FROM gbif_cells`;
  if (have.length && !force && Math.max(...have.map((h) => Number(h.age))) < 30 * 86400) return have.map((h) => ({ lat: h.cell_lat, lon: h.cell_lon }));
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const jobs: { lat: number; lon: number }[] = [];
  for (let lat = -60; lat < 80; lat += CELL) for (let lon = -180; lon < 180; lon += CELL) jobs.push({ lat, lon });
  const found: { cell_lat: number; cell_lon: number; n: number }[] = [];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (jobs.length) {
      const c = jobs.shift()!;
      const p = baseParams();
      p.set("taxonKey", "212"); p.set("eventDate", `${since},${today}`); p.set("geometry", cellPolygon(c)); p.set("limit", "0");
      try {
        const j = await gbifJson<{ count: number }>("/occurrence/search", p);
        if (j.count >= 10) found.push({ cell_lat: c.lat, cell_lon: c.lon, n: j.count });
      } catch { /* a missed cell is picked up next refresh */ }
    }
  }));
  if (found.length) {
    await sql`DELETE FROM gbif_cells`;
    await sql`INSERT INTO gbif_cells ${sql(found)}`;
  }
  return found.map((f) => ({ lat: f.cell_lat, lon: f.cell_lon }));
}

/**
 * The order weeks are refreshed in, as offsets from this week: the last three weeks, then four older ones, and again, back a
 * year. GBIF records keep arriving for months, so old weeks are revisited too, and recent weeks about every 14 hours.
 */
export function refreshCycle(backTo = 52, olderPerPass = 4): number[] {
  const out: number[] = [];
  for (let w = 3; w <= backTo; w += olderPerPass) {
    out.push(0, 1, 2);
    for (let o = w; o < w + olderPerPass && o <= backTo; o++) out.push(o);
  }
  return out;
}

/**
 * One slice of the rolling GBIF refresh: carries on where the last run stopped, so every cell gets its turn however short the
 * time budget is. Effort is rebuilt for the weeks touched.
 */
export async function refreshGbifWeekly(budgetMs = 200_000): Promise<{ cells: number; rows: number; errors: number; done: number; total: number }> {
  const t0 = Date.now();
  const cells = await gbifCells();
  const cycle = refreshCycle();
  const total = cycle.length * cells.length;
  const [state] = await sql<{ cursor: string | null }[]>`SELECT cursor FROM pull_state WHERE connector = 'gbif_weekly_cursor'`;
  let at = Number(state?.cursor ?? 0) % total;
  const now = new Date();
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const touched = new Set<string>();
  let rows = 0, errors = 0, done = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (done < total && Date.now() - t0 < budgetMs) {
      const i = at; at = (at + 1) % total; done++;
      const week = new Date(monday - cycle[Math.floor(i / cells.length)] * 7 * 86400_000).toISOString().slice(0, 10);
      try { rows += await rollupGbifCellWeek(cells[i % cells.length], week); touched.add(week); } catch { errors++; }
    }
  }));
  await sql`INSERT INTO pull_state (connector, cursor, last_run_at) VALUES ('gbif_weekly_cursor', ${String(at)}, now())
            ON CONFLICT (connector) DO UPDATE SET cursor = EXCLUDED.cursor, last_run_at = now()`;
  await refreshWeeklyEffort([...touched]);
  return { cells: cells.length, rows, errors, done, total };
}

/** Remember a publisher for the credits. */
export async function noteDataset(key: string, n: number): Promise<void> {
  const [row] = await sql`SELECT 1 FROM gbif_datasets WHERE dataset_key = ${key}`;
  if (row) { await sql`UPDATE gbif_datasets SET n = n + ${n}, last_seen = now() WHERE dataset_key = ${key}`; return; }
  try {
    const d = await gbifJson<{ title: string; doi?: string; license?: string; publishingOrganizationKey?: string }>(`/dataset/${key}`, new URLSearchParams());
    let publisher: string | null = null;
    if (d.publishingOrganizationKey) {
      try { publisher = (await gbifJson<{ title: string }>(`/organization/${d.publishingOrganizationKey}`, new URLSearchParams())).title; } catch { /* optional */ }
    }
    await sql`INSERT INTO gbif_datasets (dataset_key, title, doi, license, publisher, n) VALUES (${key}, ${d.title}, ${d.doi ?? null}, ${d.license ?? null}, ${publisher}, ${n}) ON CONFLICT (dataset_key) DO UPDATE SET n = gbif_datasets.n + EXCLUDED.n, last_seen = now()`;
  } catch { /* credited next time it is seen */ }
}
