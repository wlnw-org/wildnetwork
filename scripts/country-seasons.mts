/**
 * Builds src/data/country-seasons.json for /arrivals/<country> and the country results of the map search: for every
 * country with at least MIN_COUNTRY openly licensed bird records, which birds come and go and in which months, plus the 40
 * most recorded birds with their months, the country's centre and bounding box.
 *
 * Source: GBIF occurrence records of birds (class Aves), CC0 and CC BY 4.0 only (mostly the eBird Observation Dataset),
 * calendar years FROM to TO, per month. Same method as scripts/india-seasons.mts, with GADM level 1 regions (states,
 * provinces) as the areas: a species' share of a month is its records over all bird records in that region and month, so
 * where and when people go birding cancels out; presence = share / its peak month. Each of the country's REGIONS busiest
 * regions (with at least MIN_REGION records) with 100 or more records of the species gives a status; the species takes a
 * status only when regions holding 60% of its records agree, and at least two regions do (a country with one such
 * region is taken whole, and the two-region rule is dropped).
 *
 * Status, with "cold months" November to February and "warm months" May to August, swapped south of 10 degrees S:
 *   winter visitor: mean presence in the cold months >= 0.5 and in the warm months <= 0.1
 *   summer visitor: the reverse
 *   passage migrant: peak in March, April, September or October and both means <= 0.2
 * Arrival and leaving: from the quietest month, the first and the last month at or above 0.25 of the peak.
 * Centre and bounding box: OpenStreetMap Nominatim (1 request per second).
 *
 * Usage: pnpm exec tsx --env-file=.env.production.local scripts/country-seasons.mts [cacheDir]
 *   About 75 GBIF queries per country (~8,500 in all, an hour or two). Raw counts are cached per country in cacheDir
 *   (default .cache/country-seasons, git-ignored), so a stopped run resumes and the rules can be retuned without GBIF.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { englishName } from "../src/lib/gbif";

const FROM = 2016, TO = 2025, MIN_COUNTRY = 200_000, MIN_REGION = 20_000, REGIONS = 5, MIN_RECORDS = 300, KEEP = 40, CONC = 3;
const UA = { "User-Agent": "WildlifeNetwork/0.1 (https://wlnw.org)" };
const CACHE = process.argv[2] ?? ".cache/country-seasons";
mkdirSync(CACHE, { recursive: true });
// Countries with their own hand-made pages keep those slugs.
const SLUG: Record<string, string> = { GB: "uk", IN: "india", US: "united-states", CD: "dr-congo", CI: "ivory-coast", CG: "congo" };
const NAME: Record<string, string> = { HK: "Hong Kong", MO: "Macao", PS: "Palestine", MM: "Myanmar", TR: "Turkey", CI: "Côte d'Ivoire",
  BA: "Bosnia and Herzegovina", CD: "Democratic Republic of the Congo", CG: "Republic of the Congo", TT: "Trinidad and Tobago",
  AG: "Antigua and Barbuda", KN: "Saint Kitts and Nevis", VC: "Saint Vincent and the Grenadines", ST: "São Tomé and Príncipe" };
const intl = new Intl.DisplayNames(["en"], { type: "region" });
const display = { of: (iso: string) => NAME[iso] ?? intl.of(iso)?.replace(/ & /g, " and ") };
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Facet = { count: number; facets: { field: string; counts: { name: string; count: number }[] }[] };
async function gbif(p: Record<string, string>): Promise<Facet> {
  const q = new URLSearchParams({ classKey: "212", year: `${FROM},${TO}`, limit: "0", ...p });
  for (const l of ["CC0_1_0", "CC_BY_4_0"]) q.append("license", l);
  for (let i = 0; ; i++) {
    const r = await fetch(`https://api.gbif.org/v1/occurrence/search?${q}`, { headers: UA }).catch(() => null);
    if (r?.ok) return r.json() as Promise<Facet>;
    if (i >= 8) throw new Error(`gbif ${r?.status} ${q}`);
    // GBIF answers 429 when pushed: back off for longer then.
    await new Promise((res) => setTimeout(res, (r?.status === 429 ? 20000 : 3000) * (i + 1)));
  }
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) await fn(items[next++]); }));
}

type Area = { id: string; totals: number[]; counts: Record<string, number[]> };
type Raw = { iso: string; whole: Area; regions: Area[]; centre: [number, number]; bbox: [number, number, number, number] };

/** 12 monthly facet queries for one area: all bird records, and records per species. */
async function area(id: string, filter: Record<string, string>, facetLimit: number): Promise<Area> {
  const a: Area = { id, totals: Array(12).fill(0), counts: {} };
  for (let m = 1; m <= 12; m++) {
    const d = await gbif({ ...filter, month: String(m), facet: "speciesKey", facetLimit: String(facetLimit) });
    a.totals[m - 1] = d.count;
    for (const x of d.facets[0]?.counts ?? []) (a.counts[x.name] ??= Array(12).fill(0))[m - 1] = x.count;
  }
  return a;
}

let lastNominatim = 0;
async function nominatim(iso: string): Promise<{ centre: [number, number]; bbox: [number, number, number, number] }> {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  let r = await fetch(`https://nominatim.openstreetmap.org/search?country=${iso}&featureType=country&format=json&limit=1`, { headers: UA });
  let [h] = (await r.json()) as { lat: string; lon: string; boundingbox: string[] }[];
  // Territories (Hong Kong, Puerto Rico) are not "countries" to Nominatim: look them up by name instead.
  if (!h) {
    await new Promise((res) => setTimeout(res, 1100));
    lastNominatim = Date.now();
    r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(display.of(iso) ?? iso)}&format=json&limit=1`, { headers: UA });
    [h] = (await r.json()) as { lat: string; lon: string; boundingbox: string[] }[];
  }
  if (!h) throw new Error(`nominatim ${iso}`);
  const [s, n, w, e] = h.boundingbox.map(Number);
  return { centre: [Number(h.lat), Number(h.lon)], bbox: [w, s, e, n] };
}

const top = await gbif({ facet: "country", facetLimit: "300" });
const isos = top.facets[0].counts.filter((c) => c.count >= MIN_COUNTRY).map((c) => c.name);
console.log(`${isos.length} countries`);
let done = 0;
await pool(isos, CONC, async (iso) => {
  const file = `${CACHE}/${iso}.json`;
  if (existsSync(file)) { done++; return; }
  const geo = await nominatim(iso).catch((e) => { console.error(String(e)); return null; });
  if (!geo) return;
  try {
  const f = await gbif({ country: iso, facet: "gadmLevel1Gid", facetLimit: "200" });
  const ids = f.facets[0]?.counts.filter((c) => c.count >= MIN_REGION).slice(0, REGIONS).map((c) => c.name) ?? [];
  const whole = await area(iso, { country: iso }, 400);
  const regions: Area[] = [];
  if (ids.length >= 2) for (const id of ids) regions.push(await area(id, { gadmGid: id }, 2000));
  const raw: Raw = { iso, whole, regions, ...geo };
  writeFileSync(file, JSON.stringify(raw));
  console.log(`${++done}/${isos.length} ${iso}: ${whole.totals.reduce((a, b) => a + b, 0).toLocaleString("en-GB")} records, ${regions.length} regions`);
  } catch (e) { console.error(`${iso} skipped, rerun to retry: ${e}`); }
});

// ---- Rules (re-run from the cache to retune) ----
const mean = (p: number[], ms: number[]) => ms.reduce((s, m) => s + p[m - 1], 0) / ms.length;
type Status = "winter" | "summer" | "passage";
function classify(p: number[], south: boolean): Status | null {
  const cold = mean(p, south ? [5, 6, 7, 8] : [11, 12, 1, 2]), warm = mean(p, south ? [11, 12, 1, 2] : [5, 6, 7, 8]), peak = p.indexOf(1) + 1;
  return cold >= 0.5 && warm <= 0.1 ? "winter" : warm >= 0.5 && cold <= 0.1 ? "summer"
    : [3, 4, 9, 10].includes(peak) && cold <= 0.2 && warm <= 0.2 ? "passage" : null;
}
function months(p: number[]): [number | null, number | null] {
  const start = p.indexOf(Math.min(...p));
  let arrive: number | null = null, leave: number | null = null;
  for (let i = 1; i < 12; i++) { const m = (start + i) % 12; if (p[m] >= 0.25) { arrive ??= m + 1; leave = m + 1; } }
  return [arrive, leave];
}
const presence = (c: number[], t: number[]) => {
  const s = c.map((x, i) => (t[i] ? x / t[i] : 0)), peak = Math.max(...s);
  return s.map((v) => (peak ? v / peak : 0));
};

type Migrant = [number, Status, number, number | null, number | null, number[]];
type Country = { iso: string; slug: string; name: string; centre: [number, number]; bbox: [number, number, number, number]; south: boolean;
  records: number; regions: number; migrants: Migrant[]; top: [number, number, string][] };
const countries: Country[] = [];
for (const iso of isos) {
  if (!existsSync(`${CACHE}/${iso}.json`)) continue;
  const raw = JSON.parse(readFileSync(`${CACHE}/${iso}.json`, "utf8")) as Raw;
  const south = raw.centre[0] < -10;
  const areas = raw.regions.length >= 2 ? raw.regions : [raw.whole];
  const keys = new Set(areas.flatMap((a) => Object.keys(a.counts)));
  const migrants: Migrant[] = [];
  for (const key of keys) {
    const per = areas.flatMap((a) => {
      const c = a.counts[key];
      const n = c ? c.reduce((x, y) => x + y, 0) : 0;
      if (n < 100) return [];
      const p = presence(c, a.totals);
      return [{ n, p, status: classify(p, south) }];
    });
    const records = per.reduce((x, y) => x + y.n, 0);
    if (records < MIN_RECORDS) continue;
    const weight = (st: Status) => per.filter((x) => x.status === st).reduce((x, y) => x + y.n, 0) / records;
    const status = (["winter", "summer", "passage"] as Status[]).find((st) => weight(st) >= 0.6);
    if (!status) continue;
    const agree = per.filter((x) => x.status === status);
    if (areas.length >= 2 && agree.length < 2) continue;
    const sum = Array.from({ length: 12 }, (_, i) => agree.reduce((s, x) => s + x.p[i] * x.n, 0)), peak = Math.max(...sum);
    const p = sum.map((v) => v / peak);
    migrants.push([Number(key), status, records, ...months(p), p.map((v) => Math.round(v * 100) / 100)]);
  }
  migrants.sort((a, b) => b[2] - a[2]);
  const w = raw.whole;
  const topList = Object.entries(w.counts).map(([key, c]) => {
    const p = presence(c, w.totals);
    return [Number(key), c.reduce((x, y) => x + y, 0), p.map((v) => (v < 0.05 ? 0 : Math.max(1, Math.round(v * 9)))).join("")] as [number, number, string];
  }).sort((a, b) => b[1] - a[1]).slice(0, KEEP);
  const name = display.of(iso) ?? iso;
  countries.push({ iso, slug: SLUG[iso] ?? slugify(name), name, centre: raw.centre, bbox: raw.bbox, south,
    records: w.totals.reduce((a, b) => a + b, 0), regions: raw.regions.length, migrants, top: topList });
}

// Names: gbif_taxa first, then GBIF itself (cached in CACHE/names.json).
const keys = [...new Set(countries.flatMap((c) => [...c.migrants.map((m) => m[0]), ...c.top.map((t) => t[0])]))];
const namesFile = `${CACHE}/names.json`;
const names: Record<number, [string, string | null]> = existsSync(namesFile) ? JSON.parse(readFileSync(namesFile, "utf8")) : {};
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
for (const r of await sql<{ species_key: number; scientific_name: string; vernacular_name: string | null }[]>`
  SELECT species_key, scientific_name, vernacular_name FROM gbif_taxa WHERE species_key IN ${sql(keys)}`) names[r.species_key] ??= [r.scientific_name, r.vernacular_name];
await sql.end();
const missing = keys.filter((k) => !names[k]);
console.log(`names: ${keys.length - missing.length} known, ${missing.length} to look up`);
let n = 0;
await pool(missing, 4, async (k) => {
  const s = await fetch(`https://api.gbif.org/v1/species/${k}`, { headers: UA }).then((r) => r.json()) as { canonicalName?: string; scientificName: string };
  names[k] = [s.canonicalName ?? s.scientificName, await englishName(k).catch(() => null)];
  if (++n % 200 === 0) { console.log(`names ${n}/${missing.length}`); writeFileSync(namesFile, JSON.stringify(names)); }
});
writeFileSync(namesFile, JSON.stringify(names));

const out = Object.fromEntries(countries.sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.slug, {
  iso: c.iso, name: c.name, centre: c.centre.map((v) => Math.round(v * 100) / 100), bbox: c.bbox.map((v) => Math.round(v * 100) / 100),
  south: c.south, records: c.records, regions: c.regions,
  // [scientific name, English name, status, records, arrival month, leaving month, presence Jan..Dec]
  migrants: c.migrants.map(([k, ...rest]) => [names[k][0], names[k][1], ...rest]),
  // [scientific name, English name, records, months as 12 digits 0 to 9]
  top: c.top.map(([k, r, m]) => [names[k][0], names[k][1], r, m]),
}]));
writeFileSync("src/data/country-seasons.json", JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), years: [FROM, TO],
  source: "GBIF.org occurrence records of birds, CC0 and CC BY 4.0, mostly the eBird Observation Dataset (Cornell Lab of Ornithology); country outlines from OpenStreetMap Nominatim",
  countries: out,
}) + "\n");
console.log(`wrote ${countries.length} countries, ${countries.reduce((s, c) => s + c.migrants.length, 0)} migrant entries`);
