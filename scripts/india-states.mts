/**
 * Builds src/data/india-states.json for /arrivals/india/<state>: per Indian state, which of the national migrants
 * (src/data/india-seasons.json) come and go there and in which months, plus the 40 most recorded birds with their months.
 *
 * Source: GBIF occurrence records of birds in India, CC0 and CC BY 4.0 only (mostly the eBird Observation Dataset),
 * calendar years FROM to TO, per state (GADM level 1, gadmGid IND.<n>_1) and month. A species' share of a month is its
 * records over all bird records in that state that month, so the birding calendar cancels out; presence = share / peak.
 * A national migrant is listed for a state only when it has at least MIN_SP records there and the state's own months give
 * the same status with the national rules (so a winter visitor to the north that lives all year in the south is not listed
 * in the south). Arrival and leaving: from the quietest month, the first and last month at or above 0.25 of the peak. Jammu and Kashmir and Ladakh are left out: GBIF
 * files their records under disputed-area codes, not IND.
 *
 * Usage: pnpm exec tsx --env-file=.env.production.local scripts/india-states.mts   (about 380 GBIF queries, ~10 min; rerun after india-seasons.mts)
 */
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { englishName } from "../src/lib/gbif";

const FROM = 2016, TO = 2025, MIN_STATE = 40000, MIN_SP = 40, KEEP = 40, CONC = 4;
const UA = { "User-Agent": "WildlifeNetwork/0.1 (https://wlnw.org)" };
// GADM level 1 ids -> [slug, display name]
const STATES: Record<string, [string, string]> = {
  "IND.1_1": ["andaman-and-nicobar-islands", "Andaman and Nicobar Islands"], "IND.2_1": ["andhra-pradesh", "Andhra Pradesh"],
  "IND.3_1": ["arunachal-pradesh", "Arunachal Pradesh"], "IND.4_1": ["assam", "Assam"], "IND.5_1": ["bihar", "Bihar"],
  "IND.6_1": ["chandigarh", "Chandigarh"], "IND.7_1": ["chhattisgarh", "Chhattisgarh"], "IND.10_1": ["goa", "Goa"],
  "IND.11_1": ["gujarat", "Gujarat"], "IND.12_1": ["haryana", "Haryana"], "IND.13_1": ["himachal-pradesh", "Himachal Pradesh"],
  "IND.15_1": ["jharkhand", "Jharkhand"], "IND.16_1": ["karnataka", "Karnataka"], "IND.17_1": ["kerala", "Kerala"],
  "IND.19_1": ["madhya-pradesh", "Madhya Pradesh"], "IND.20_1": ["maharashtra", "Maharashtra"], "IND.21_1": ["manipur", "Manipur"],
  "IND.22_1": ["meghalaya", "Meghalaya"], "IND.23_1": ["mizoram", "Mizoram"], "IND.24_1": ["nagaland", "Nagaland"],
  "IND.25_1": ["delhi", "Delhi"], "IND.26_1": ["odisha", "Odisha"], "IND.27_1": ["puducherry", "Puducherry"],
  "IND.28_1": ["punjab", "Punjab"], "IND.29_1": ["rajasthan", "Rajasthan"], "IND.30_1": ["sikkim", "Sikkim"],
  "IND.31_1": ["tamil-nadu", "Tamil Nadu"], "IND.32_1": ["telangana", "Telangana"], "IND.33_1": ["tripura", "Tripura"],
  "IND.34_1": ["uttar-pradesh", "Uttar Pradesh"], "IND.35_1": ["uttarakhand", "Uttarakhand"], "IND.36_1": ["west-bengal", "West Bengal"],
};

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

// Same rules as scripts/india-seasons.mts.
const mean = (a: number[], ms: number[]) => ms.reduce((s, m) => s + a[m - 1], 0) / ms.length;
const WINTER = [11, 12, 1, 2], SUMMER = [5, 6, 7, 8];
/** [arrival, leaving] months 1 to 12: from the quietest month, the first and the last month at or above 0.25. A state has
 *  fewer records than the country, so presence rises over two or three months more often than in one step, and the
 *  national rule (a month below 0.1 right before) would leave many birds without a month. */
function months(p: number[]): [number | null, number | null] {
  const start = p.indexOf(Math.min(...p));
  let arrive: number | null = null, leave: number | null = null;
  for (let i = 1; i < 12; i++) {
    const m = (start + i) % 12;
    if (p[m] >= 0.25) { if (arrive === null) arrive = m + 1; leave = m + 1; }
  }
  return [arrive, leave];
}
type Status = "winter" | "summer" | "passage";
function classify(p: number[]): Status | null {
  const w = mean(p, WINTER), s = mean(p, SUMMER), peakMonth = p.indexOf(1) + 1;
  return w >= 0.5 && s <= 0.1 ? "winter" : s >= 0.5 && w <= 0.1 ? "summer" : [3, 4, 9, 10].includes(peakMonth) && w <= 0.2 && s <= 0.2 ? "passage" : null;
}

const national = JSON.parse(readFileSync("src/data/india-seasons.json", "utf8")) as { species: { key: number; sci: string; status: Status }[] };
const natByKey = new Map(national.species.map((s) => [s.key, s]));

// Which states have enough records.
const f = await gbif<{ facets: { counts: { name: string; count: number }[] }[] }>({
  country: "IN", classKey: "212", year: `${FROM},${TO}`, limit: "0", facet: "gadmLevel1Gid", facetLimit: "60" });
const gids = f.facets[0].counts.filter((c) => STATES[c.name] && c.count >= MIN_STATE).map((c) => c.name);
console.log(`${gids.length} states`);

type Raw = { totals: number[]; counts: Map<number, number[]> };
const raw = new Map<string, Raw>();
const jobs = gids.flatMap((g) => Array.from({ length: 12 }, (_, i) => ({ g, m: i + 1 })));
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const { g, m } = jobs[next++];
    const d = await gbif<{ count: number; facets: { counts: { name: string; count: number }[] }[] }>({
      gadmGid: g, classKey: "212", year: `${FROM},${TO}`, month: String(m), limit: "0", facet: "speciesKey", facetLimit: "2000" });
    if (!raw.has(g)) raw.set(g, { totals: Array(12).fill(0), counts: new Map() });
    const r = raw.get(g)!;
    r.totals[m - 1] = d.count;
    for (const x of d.facets[0]?.counts ?? []) {
      const k = Number(x.name), a = r.counts.get(k) ?? Array(12).fill(0);
      a[m - 1] = x.count; r.counts.set(k, a);
    }
    if (++done % 24 === 0) console.log(`${done}/${jobs.length}`);
  }
}));

type Migrant = [string, Status, number, number | null, number | null, number[]];
type TopKey = { key: number; n: number; m: string };
const states: Record<string, { name: string; gid: string; records: number; migrants: Migrant[]; top: TopKey[] }> = {};
for (const g of gids) {
  const r = raw.get(g)!, [slug, name] = STATES[g];
  const all = [...r.counts.entries()].map(([key, a]) => {
    const share = a.map((x, i) => (r.totals[i] ? x / r.totals[i] : 0)), peak = Math.max(...share);
    return { key, n: a.reduce((x, y) => x + y, 0), p: share.map((v) => (peak ? v / peak : 0)) };
  });
  const migrants: Migrant[] = [];
  for (const s of all) {
    const nat = natByKey.get(s.key);
    if (!nat || s.n < MIN_SP || classify(s.p) !== nat.status) continue;
    migrants.push([nat.sci, nat.status, s.n, ...months(s.p), s.p.map((v) => Math.round(v * 100) / 100)]);
  }
  migrants.sort((a, b) => b[2] - a[2]);
  const top = all.sort((a, b) => b.n - a.n).slice(0, KEEP)
    .map((s) => ({ key: s.key, n: s.n, m: s.p.map((v) => (v < 0.05 ? 0 : Math.max(1, Math.round(v * 9)))).join("") }));
  states[slug] = { name, gid: g, records: r.totals.reduce((x, y) => x + y, 0), migrants, top };
  console.log(`${name}: ${states[slug].records.toLocaleString("en-GB")} records, ${migrants.length} migrants`);
}

// Names for the top lists: gbif_taxa first, then GBIF itself.
const keys = [...new Set(Object.values(states).flatMap((s) => s.top.map((t) => t.key)))];
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

const out = Object.fromEntries(Object.entries(states).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([slug, s]) => [slug, {
  name: s.name, records: s.records,
  // [scientific name, status, records, arrival month, leaving month, presence Jan..Dec]
  migrants: s.migrants,
  // [scientific name, English name, records, months as 12 digits 0 to 9]
  top: s.top.map((t) => [names[t.key][0], names[t.key][1], t.n, t.m]),
}]));
writeFileSync("src/data/india-states.json", JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), years: [FROM, TO],
  source: "GBIF.org occurrence records of birds in India, CC0 and CC BY 4.0, mostly the eBird Observation Dataset (Cornell Lab of Ornithology)",
  states: out,
}) + "\n");
console.log(`wrote ${Object.keys(out).length} states`);
