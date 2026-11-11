/**
 * Builds src/data/place-birds.json for the /places/<city> pages: the birds recorded most within 50 km of each city, and
 * the months each is recorded, so every city page has a year-round checklist even where no station sends us data.
 *
 * Source: GBIF occurrence records of birds (class Aves), CC0 and CC BY 4.0 only, calendar years FROM to TO, within RADIUS
 * of the city's point. Per month we take the top FACET species and all bird records. A species' share of a month is its
 * records over all bird records that month, so the birding seasons (when people go out) cancel out; m[i] is that share
 * as a step 0 to 9 of the species' own busiest month (9 = its peak, 0 = under 5% of it or not in that month's top list).
 *
 * Usage: pnpm exec tsx --env-file=.env.production.local scripts/place-birds.mts   (about 1,300 GBIF queries, ~10 min; rerun once a year)
 */
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { englishName } from "../src/lib/gbif";

const FROM = 2016, TO = 2025, RADIUS = "50km", FACET = 200, KEEP = 40, CONC = 4;
const UA = { "User-Agent": "WildlifeNetwork/0.1 (https://wlnw.org)" };
type Place = { slug: string; name: string; lat: number; lon: number };
const places: Place[] = JSON.parse(readFileSync("src/data/places.json", "utf8"));

async function gbif<T>(p: Record<string, string>): Promise<T> {
  const q = new URLSearchParams(p);
  for (const l of ["CC0_1_0", "CC_BY_4_0"]) q.append("license", l);
  for (let i = 0; ; i++) {
    const r = await fetch(`https://api.gbif.org/v1/occurrence/search?${q}`, { headers: UA }).catch(() => null);
    if (r?.ok) return r.json() as Promise<T>;
    if (i >= 5) throw new Error(`gbif ${r?.status}`);
    await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
  }
}

type Row = { key: number; n: number; m: number[] };
type City = { records: number; species: Row[] };
async function city(p: Place): Promise<City> {
  const totals = Array(12).fill(0), counts = new Map<number, number[]>();
  for (let m = 1; m <= 12; m++) {
    const d = await gbif<{ count: number; facets: { counts: { name: string; count: number }[] }[] }>({
      geoDistance: `${p.lat},${p.lon},${RADIUS}`, classKey: "212", year: `${FROM},${TO}`, month: String(m), limit: "0", facet: "speciesKey", facetLimit: String(FACET) });
    totals[m - 1] = d.count;
    for (const f of d.facets[0]?.counts ?? []) {
      const a = counts.get(Number(f.name)) ?? Array(12).fill(0);
      a[m - 1] = f.count; counts.set(Number(f.name), a);
    }
  }
  const species = [...counts.entries()].map(([key, a]) => {
    const share = a.map((x, i) => (totals[i] ? x / totals[i] : 0)), peak = Math.max(...share);
    return { key, n: a.reduce((x, y) => x + y, 0), m: share.map((s) => (s / peak < 0.05 ? 0 : Math.max(1, Math.round((s / peak) * 9)))) };
  }).sort((a, b) => b.n - a.n).slice(0, KEEP);
  return { records: totals.reduce((x, y) => x + y, 0), species };
}

const out = new Map<string, City>();
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < places.length) {
    const p = places[next++];
    const c = await city(p);
    out.set(p.slug, c);
    console.log(`${out.size}/${places.length} ${p.name}: ${c.records.toLocaleString("en-GB")} records`);
  }
}));

// Names: gbif_taxa first, then GBIF itself.
const keys = [...new Set([...out.values()].flatMap((c) => c.species.map((s) => s.key)))];
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const known = new Map((await sql<{ species_key: number; scientific_name: string; vernacular_name: string | null }[]>`
  SELECT species_key, scientific_name, vernacular_name FROM gbif_taxa WHERE species_key IN ${sql(keys)}`).map((r) => [r.species_key, r]));
await sql.end();
const names: Record<number, [string, string | null]> = {};
for (const k of keys) {
  const t = known.get(k);
  if (t) { names[k] = [t.scientific_name, t.vernacular_name]; continue; }
  const s = await fetch(`https://api.gbif.org/v1/species/${k}`, { headers: UA }).then((r) => r.json()) as { canonicalName?: string; scientificName: string };
  names[k] = [s.canonicalName ?? s.scientificName, await englishName(k)];
}

const cities: Record<string, { records: number; species: [string, string | null, number, string][] }> = {};
for (const p of places) {
  const c = out.get(p.slug)!;
  // [scientific name, English name, records, months as 12 digits]
  cities[p.slug] = { records: c.records, species: c.species.map((s) => [names[s.key][0], names[s.key][1], s.n, s.m.join("")]) };
}
writeFileSync("src/data/place-birds.json", JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), years: [FROM, TO], radiusKm: 50,
  source: "GBIF.org occurrence records of birds, CC0 and CC BY 4.0, mostly the eBird Observation Dataset (Cornell Lab of Ornithology)",
  cities,
}) + "\n");
console.log(`wrote ${places.length} cities, ${keys.length} species`);
