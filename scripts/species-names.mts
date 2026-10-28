// Fill species_names from the BirdNET+ taxonomy (birdnet.cornell.edu/taxonomy, metadata under its open-source licence).
// 1) bulk CSV: es, fr, de, pt for every species we have; 2) per-species API for hi and ta, which the CSV lacks, for species
// shown on the site (arrivals and recent weekly records), at most 2 requests a second. Resumable: step 2 skips species done.
// Usage: tsx --env-file=.env.production.local scripts/species-names.mts [maxApiCalls=4000]
import { sql } from "../src/lib/db";

const UA = "WildlifeNetwork/0.1 (+https://wlnw.org)";
const BULK = ["es", "fr", "de", "pt"], API = ["hi", "ta"];
const max = Number(process.argv[2] ?? 4000);

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const ours = new Set((await sql<{ s: string }[]>`SELECT scientific_name AS s FROM species_group WHERE is_species`).map((r) => r.s));
const csv = parseCsv(await (await fetch("https://birdnet.cornell.edu/taxonomy/api/download/csv", { headers: { "user-agent": UA } })).text());
const head = csv[0], col = (k: string) => head.indexOf(k);
const iSci = col("scientific_name"), iLang = BULK.map((l) => col(`common_name_${l}`));
const bulk = csv.slice(1).filter((r) => ours.has(r[iSci])).map((r) => {
  const names = Object.fromEntries(BULK.flatMap((l, j) => (r[iLang[j]] ? [[l, r[iLang[j]]]] : [])));
  return { scientific_name: r[iSci], names };
}).filter((r) => Object.keys(r.names).length);
for (let i = 0; i < bulk.length; i += 500) {
  const chunk = bulk.slice(i, i + 500);
  await sql`INSERT INTO species_names ${sql(chunk.map((c) => ({ scientific_name: c.scientific_name, names: sql.json(c.names) })))}
    ON CONFLICT (scientific_name) DO UPDATE SET names = species_names.names || EXCLUDED.names, fetched_at = now()`;
}
console.log(`bulk: ${bulk.length} species with names`);

const todo = await sql<{ s: string }[]>`
  SELECT s FROM (SELECT DISTINCT scientific_name AS s FROM phenology
                 UNION SELECT DISTINCT scientific_name FROM species_weekly WHERE week >= CURRENT_DATE - 56 AND count >= 20) x
  WHERE NOT EXISTS (SELECT 1 FROM species_names n WHERE n.scientific_name = x.s AND n.names ? '_api')
  LIMIT ${max}`;
let done = 0;
for (const { s } of todo) {
  try {
    const r = await fetch(`https://birdnet.cornell.edu/taxonomy/api/species?q=${encodeURIComponent(s)}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
    const t = r.ok ? ((await r.json()) as { results?: { scientific_name: string; common_names?: Record<string, string> }[] }).results?.find((x) => x.scientific_name === s) : undefined;
    const add: Record<string, string> = { _api: "1" };
    for (const l of API) if (t?.common_names?.[l]) add[l] = t.common_names[l];
    await sql`INSERT INTO species_names (scientific_name, names) VALUES (${s}, ${sql.json(add)})
      ON CONFLICT (scientific_name) DO UPDATE SET names = species_names.names || EXCLUDED.names, fetched_at = now()`;
  } catch { /* retried on the next run */ }
  if (++done % 250 === 0) console.log(`api: ${done}/${todo.length}`);
  await new Promise((res) => setTimeout(res, 500));
}
console.log(`api: ${done} species checked for hi/ta`);
process.exit(0);
