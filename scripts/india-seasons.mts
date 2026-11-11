/**
 * Builds src/data/india-seasons.json for /arrivals/india: when each bird species is present in India, month by month.
 *
 * Source: GBIF occurrence records of birds in India, CC0 and CC BY 4.0 only (mostly the eBird Observation Dataset), for
 * calendar years FROM to TO, per 5 degree area and month. In each area a species' share of a month is its records over all
 * bird records there that month, so the seasons of birding (where and when people go) cancel out. presence[m] = share[m] /
 * the species' highest monthly share (1 = its peak month). Areas with 100 or more records of the species each give a
 * status; the species takes a status only when areas holding 60% of its records agree, and its national profile is the
 * record-weighted mean of those areas.
 *
 * Status (only species with at least MIN_RECORDS records):
 *   winter visitor: mean presence Nov to Feb >= 0.5 and mean presence May to Aug <= 0.1
 *   summer visitor: mean presence May to Aug >= 0.5 and mean presence Nov to Feb <= 0.1
 *   passage migrant: peak in Mar, Apr, Sep or Oct and both of those means <= 0.2
 *   every status needs the pattern in at least two areas
 * Arrival month: the first month at or above 0.25 after a month below 0.1. Leaving month: the last month at or above 0.25
 * before presence falls below 0.1.
 *
 * Usage: pnpm exec tsx --env-file=.env.production.local scripts/india-seasons.mts   (about 15 minutes, about 430 GBIF queries; rerun once a year)
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { englishName } from "../src/lib/gbif";

const FROM = 2016, TO = 2025, MIN_RECORDS = 300;
const UA = { "User-Agent": "WildlifeNetwork/0.1 (https://wlnw.org)" };
const base = { country: "IN", classKey: "212", year: `${FROM},${TO}`, limit: "0" };
const lic = ["CC0_1_0", "CC_BY_4_0"];

async function gbif<T>(path: string, p: Record<string, string>, multi: [string, string[]][] = []): Promise<T> {
  const q = new URLSearchParams(p);
  for (const [k, vs] of multi) for (const v of vs) q.append(k, v);
  for (let i = 0; ; i++) {
    const r = await fetch(`https://api.gbif.org/v1${path}?${q}`, { headers: UA });
    if (r.ok) return r.json() as Promise<T>;
    if (i >= 4) throw new Error(`gbif ${r.status} ${path}`);
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
}

// Per 5 degree area and month: records of each species, and all bird records, so a species is compared with what was
// recorded in the same place and month (birders reach the Himalaya in summer and the north-east in spring, which would
// otherwise make residents there look like migrants).
type Cell = { lat: number; lon: number; totals: number[]; counts: Map<number, number[]> };
const cells: Cell[] = [];
const monthTotals = Array(12).fill(0);
for (let lat = 5; lat < 35; lat += 5) for (let lon = 65; lon < 95; lon += 5) {
  const c: Cell = { lat, lon, totals: Array(12).fill(0), counts: new Map() };
  for (let m = 1; m <= 12; m++) {
    const d = await gbif<{ count: number; facets: { counts: { name: string; count: number }[] }[] }>("/occurrence/search",
      { ...base, month: String(m), decimalLatitude: `${lat},${lat + 5}`, decimalLongitude: `${lon},${lon + 5}`, facet: "speciesKey", facetLimit: "3000" }, [["license", lic]]);
    c.totals[m - 1] = d.count; monthTotals[m - 1] += d.count;
    for (const f of d.facets[0]?.counts ?? []) {
      const k = Number(f.name);
      const a = c.counts.get(k) ?? Array(12).fill(0);
      a[m - 1] = f.count; c.counts.set(k, a);
    }
  }
  if (c.totals.reduce((x, y) => x + y, 0)) { cells.push(c); console.log(`area ${lat},${lon}: ${c.totals.reduce((x, y) => x + y, 0).toLocaleString("en-GB")} records`); }
}

const mean = (a: number[], ms: number[]) => ms.reduce((s, m) => s + a[m - 1], 0) / ms.length;
const WINTER = [11, 12, 1, 2], SUMMER = [5, 6, 7, 8];
function firstUp(p: number[]): number | null {
  for (let i = 0; i < 12; i++) if (p[i] >= 0.25 && p[(i + 11) % 12] < 0.1) return i + 1;
  return null;
}
function lastUp(p: number[]): number | null {
  for (let i = 0; i < 12; i++) if (p[i] >= 0.25 && p[(i + 1) % 12] < 0.1) return i + 1;
  return null;
}
type Status = "winter" | "summer" | "passage";
function classify(p: number[]): Status | null {
  const w = mean(p, WINTER), s = mean(p, SUMMER), peakMonth = p.indexOf(1) + 1;
  return w >= 0.5 && s <= 0.1 ? "winter" : s >= 0.5 && w <= 0.1 ? "summer" : [3, 4, 9, 10].includes(peakMonth) && w <= 0.2 && s <= 0.2 ? "passage" : null;
}
/** Months, 1 to 12, as the most common value weighted by records (null when no area gives one). */
function weightedMode(xs: [number | null, number][]): number | null {
  const w = new Map<number, number>();
  for (const [m, n] of xs) if (m) w.set(m, (w.get(m) ?? 0) + n);
  return [...w.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

type Out = { key: number; sci: string; en: string | null; status: Status; arrive: number | null; leave: number | null; records: number; areas: number; presence: number[] };
const keys = new Set(cells.flatMap((c) => [...c.counts.keys()]));
const picked: Omit<Out, "sci" | "en">[] = [];
for (const key of keys) {
  // Each area with enough records gives a profile and a status; the species takes the status of most of its records.
  const per: { n: number; p: number[]; status: Status | null }[] = [];
  for (const c of cells) {
    const a = c.counts.get(key);
    if (!a) continue;
    const n = a.reduce((x, y) => x + y, 0);
    if (n < 100) continue;
    const share = a.map((x, i) => (c.totals[i] ? x / c.totals[i] : 0));
    const peak = Math.max(...share);
    const p = share.map((v) => v / peak);
    per.push({ n, p, status: classify(p) });
  }
  const records = per.reduce((x, y) => x + y.n, 0);
  if (records < MIN_RECORDS) continue;
  const weight = (st: Status) => per.filter((x) => x.status === st).reduce((x, y) => x + y.n, 0) / records;
  const status = (["winter", "summer", "passage"] as Status[]).find((st) => weight(st) >= 0.6);
  if (!status) continue;
  const agree = per.filter((x) => x.status === status);
  // Every status needs the pattern in two areas or more: in one area alone it is often where and when birders can go
  // (Ladakh in summer, the north-east in winter), not the bird moving.
  if (agree.length < 2) continue;
  // National profile: the agreeing areas' profiles weighted by their records, scaled so the peak month is 1.
  const sum = Array(12).fill(0).map((_, i) => agree.reduce((s, x) => s + x.p[i] * x.n, 0));
  const top = Math.max(...sum);
  const presence = sum.map((v) => Math.round((v / top) * 100) / 100);
  picked.push({ key, status, records, areas: agree.length, presence,
    arrive: weightedMode(agree.map((x) => [firstUp(x.p), x.n])), leave: weightedMode(agree.map((x) => [lastUp(x.p), x.n])) });
}
console.log(`${picked.length} migrant species of ${keys.size}`);
const totals = monthTotals;

// Names: gbif_taxa first (already cached English names), then GBIF itself.
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const known = new Map((await sql<{ species_key: number; scientific_name: string; vernacular_name: string | null }[]>`
  SELECT species_key, scientific_name, vernacular_name FROM gbif_taxa WHERE species_key IN ${sql(picked.map((x) => x.key))}`).map((r) => [r.species_key, r]));
await sql.end();
const out: Out[] = [];
for (const x of picked) {
  let k = known.get(x.key);
  if (!k) {
    const t = await gbif<{ canonicalName?: string; scientificName: string }>(`/species/${x.key}`, {});
    k = { species_key: x.key, scientific_name: t.canonicalName ?? t.scientificName, vernacular_name: await englishName(x.key) };
  }
  out.push({ ...x, sci: k.scientific_name, en: k.vernacular_name });
}
out.sort((a, b) => b.records - a.records);
writeFileSync("src/data/india-seasons.json", JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), years: [FROM, TO], monthRecords: totals,
  source: "GBIF.org occurrence records of birds in India, CC0 and CC BY 4.0, mostly the eBird Observation Dataset (Cornell Lab of Ornithology)",
  species: out,
}, null, 1) + "\n");
console.log(`wrote ${out.length} species: ${out.filter((x) => x.status === "winter").length} winter, ${out.filter((x) => x.status === "summer").length} summer, ${out.filter((x) => x.status === "passage").length} passage`);
