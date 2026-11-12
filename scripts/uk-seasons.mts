/**
 * Builds src/data/uk-seasons.json for /arrivals/uk and the "When does it arrive in the UK?" line on species pages.
 *
 * Source: GBIF occurrence records of birds in the United Kingdom (country GB), CC0 and CC BY 4.0 only (mostly the eBird
 * Observation Dataset), per half month (1st to 15th, 16th to month end) of each year FROM to TO. A species' share of a half
 * month is its records over all bird records then, so the birding calendar cancels out; presence = share / its peak.
 *
 * Status (species with at least MIN_RECORDS records over all years):
 *   summer visitor: peak between April and August, mean presence December to February <= 0.03, here (>= 0.1) for 2 months or more, arriving March to May
 *   winter visitor: mean presence December to February >= 0.4, June to July <= 0.03, here for 3 months or more, arriving September to December
 * Arrival: scanning from the species' quietest half month, the first half month at or above 0.25 of the peak; leaving: the
 * last half month at or above 0.1 before two quiet months (shown as "last seen regularly": birds record less once they stop
 * singing, so it is not a departure date). Worked out for the pooled years (the typical date) and
 * for every year with at least MIN_YEAR records (the range across years).
 *
 * Usage: pnpm exec tsx --env-file=.env.production.local scripts/uk-seasons.mts   (240 GBIF queries, ~5 min; rerun once a year)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { englishName } from "../src/lib/gbif";

const FROM = 2016, TO = 2025, MIN_RECORDS = 2000, MIN_YEAR = 50, BINS = 24, CONC = 4;
const UA = { "User-Agent": "WildlifeNetwork/0.1 (https://wlnw.org)" };

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

const pad = (n: number) => String(n).padStart(2, "0");
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const range = (y: number, b: number) => {
  const m = Math.floor(b / 2) + 1, first = b % 2 === 0;
  return `${y}-${pad(m)}-${first ? "01" : "16"},${y}-${pad(m)}-${first ? "15" : pad(monthEnd(y, m))}`;
};

// totals[year][bin], counts[key][year][bin]
const years = Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i);
const totals = years.map(() => Array(BINS).fill(0));
const counts = new Map<number, number[][]>();
// Optional raw cache (UK_CACHE=path) so the rules can be tuned without querying GBIF again.
const CACHE = process.env.UK_CACHE;
if (CACHE && existsSync(CACHE)) {
  const c = JSON.parse(readFileSync(CACHE, "utf8")) as { totals: number[][]; counts: [number, number[][]][] };
  c.totals.forEach((t, i) => (totals[i] = t));
  for (const [k, v] of c.counts) counts.set(k, v);
} else {
  const jobs = years.flatMap((y, yi) => Array.from({ length: BINS }, (_, b) => ({ y, yi, b })));
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < jobs.length) {
      const { y, yi, b } = jobs[next++];
      const d = await gbif<{ count: number; facets: { counts: { name: string; count: number }[] }[] }>({
        country: "GB", classKey: "212", eventDate: range(y, b), limit: "0", facet: "speciesKey", facetLimit: "1000" });
      totals[yi][b] = d.count;
      for (const f of d.facets[0]?.counts ?? []) {
        const k = Number(f.name);
        if (!counts.has(k)) counts.set(k, years.map(() => Array(BINS).fill(0)));
        counts.get(k)![yi][b] = f.count;
      }
      if (++done % 24 === 0) console.log(`${done}/${jobs.length}`);
    }
  }));
  if (CACHE) writeFileSync(CACHE, JSON.stringify({ totals, counts: [...counts] }));
}

const mean = (p: number[], bins: number[]) => bins.reduce((s, b) => s + p[b], 0) / bins.length;
const WINTER = [22, 23, 0, 1, 2, 3], HIGH_SUMMER = [10, 11, 12, 13];
/** Presence 0..1 of the peak, from counts and totals per bin. */
const presence = (c: number[], t: number[]) => {
  const s = c.map((x, i) => (t[i] ? x / t[i] : 0)), peak = Math.max(...s);
  return peak ? s.map((v) => v / peak) : s;
};
/** [arrival bin, leaving bin], scanning round the year from the quietest bin. */
function season(p: number[]): [number | null, number | null] {
  const start = p.indexOf(Math.min(...p));
  let arrive: number | null = null, leave: number | null = null;
  for (let i = 1; i <= BINS; i++) {
    const b = (start + i) % BINS;
    if (arrive === null && p[b] >= 0.25) arrive = b;
    if (arrive !== null && p[b] >= 0.1) leave = b;
    // The season ends after two quiet months (4 half months below 0.1): breeding birds go quiet after singing and are
    // recorded again on passage, so a short dip is not a departure.
    if (arrive !== null && [0, 1, 2, 3].every((j) => p[(b + j) % BINS] < 0.1)) break;
  }
  return [arrive, leave];
}

type Out = { key: number; sci: string; en: string | null; status: "summer" | "winter"; arrive: number; leave: number | null;
  arriveEarly: number; arriveLate: number; years: number; records: number; presence: number[] };
const picked: Omit<Out, "sci" | "en">[] = [];
const pooledTotals = Array.from({ length: BINS }, (_, b) => totals.reduce((s, t) => s + t[b], 0));
for (const [key, perYear] of counts) {
  const pooled = Array.from({ length: BINS }, (_, b) => perYear.reduce((s, y) => s + y[b], 0));
  const records = pooled.reduce((x, y) => x + y, 0);
  if (records < MIN_RECORDS) continue;
  const p = presence(pooled, pooledTotals);
  const here = p.filter((v) => v >= 0.1).length, peak = p.indexOf(1);
  const status = mean(p, WINTER) <= 0.03 && peak >= 6 && peak <= 17 && here >= 4 ? "summer"
    : mean(p, HIGH_SUMMER) <= 0.03 && mean(p, WINTER) >= 0.4 && here >= 6 ? "winter" : null;
  if (!status) continue;
  const [arrive, leave] = season(p);
  if (arrive === null) continue;
  // A winter visitor arrives from September to December; an August "arrival" is a resident that birders record less
  // in the busy summer months.
  if (status === "winter" && arrive < 16) continue;
  // A summer visitor arrives from March to May; a July or August "arrival" is autumn passage (shearwaters, waders).
  if (status === "summer" && (arrive < 4 || arrive > 10)) continue;
  // Each year's arrival, in bins counted from the quiet bin so a winter visitor's October and November compare in order.
  const start = p.indexOf(Math.min(...p)), rel = (b: number) => (b - start + BINS) % BINS;
  const yearly = perYear.map((c, yi) => (c.reduce((x, y) => x + y, 0) >= MIN_YEAR ? season(presence(c, totals[yi]))[0] : null))
    .filter((x): x is number => x !== null).map(rel);
  if (yearly.length < 5) continue;
  const lo = yearly.sort((a, b) => a - b)[Math.floor(yearly.length * 0.1)], hi = yearly[Math.ceil(yearly.length * 0.9) - 1];
  picked.push({ key, status, arrive, leave, arriveEarly: (lo + start) % BINS, arriveLate: (hi + start) % BINS, years: yearly.length, records,
    presence: p.map((v) => Math.round(v * 100) / 100) });
}
console.log(`${picked.length} species: ${picked.filter((x) => x.status === "summer").length} summer, ${picked.filter((x) => x.status === "winter").length} winter`);

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const known = new Map((await sql<{ species_key: number; scientific_name: string; vernacular_name: string | null }[]>`
  SELECT species_key, scientific_name, vernacular_name FROM gbif_taxa WHERE species_key IN ${sql(picked.map((x) => x.key))}`).map((r) => [r.species_key, r]));
await sql.end();
const out: Out[] = [];
for (const x of picked) {
  let k = known.get(x.key);
  if (!k) {
    const t = await fetch(`https://api.gbif.org/v1/species/${x.key}`, { headers: UA }).then((r) => r.json()) as { canonicalName?: string; scientificName: string };
    k = { species_key: x.key, scientific_name: t.canonicalName ?? t.scientificName, vernacular_name: await englishName(x.key) };
  }
  out.push({ ...x, sci: k.scientific_name, en: k.vernacular_name });
}
out.sort((a, b) => b.records - a.records);
writeFileSync("src/data/uk-seasons.json", JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), years: [FROM, TO], binRecords: pooledTotals,
  source: "GBIF.org occurrence records of birds in the United Kingdom, CC0 and CC BY 4.0, mostly the eBird Observation Dataset (Cornell Lab of Ornithology)",
  species: out,
}, null, 1) + "\n");
console.log(`wrote ${out.length}`);
