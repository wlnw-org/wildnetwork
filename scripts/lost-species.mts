// Lost species watch list (src/lib/lost.ts). Usage:
//   pnpm exec tsx --env-file=<env> scripts/lost-species.mts load            loads src/data/lost-species-2023.csv and the approved
//                                                                           extra names in src/data/lost-species-names.csv
//   pnpm exec tsx --env-file=<env> scripts/lost-species.mts check-names     asks GBIF about every listed name and writes
//                                                                           lost-species-name-check.csv (renames, synonyms and
//                                                                           doubtful matches for a person to look at; adds nothing)
//   pnpm exec tsx --env-file=<env> scripts/lost-species.mts hold-existing [--apply]
//                                                                           finds records already in the public tables; with
//                                                                           --apply moves them to the private review queue
// Only listed names and names a person approved are ever watched: a wrong extra name could hide a common species.
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "../src/lib/db";
import { gbifJson } from "../src/lib/gbif";
import { nameKeys } from "../src/lib/lostNames";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
const clean = (v: string) => (!v || v.startsWith("*") ? null : v);

const cmd = process.argv[2];
const list = parseCsv(readFileSync("src/data/lost-species-2023.csv", "utf8"));

if (cmd === "load") {
  let n = 0;
  for (const r of list) {
    const row = {
      scientific_name: r.scientific_name, common_name: clean(r.common_name), class_name: clean(r.class), order_name: clean(r.order), family: clean(r.family),
      subspecies: r.subspecies === "1", continent: clean(r.continent), countries: clean(r.countries), region: clean(r.region), red_list: clean(r.red_list),
      on_rewild_list: r.on_rewild_list === "yes" ? true : r.on_rewild_list === "no" ? false : null, source: r.source, updated_at: new Date(),
    };
    const [{ id }] = await sql<{ id: number }[]>`INSERT INTO lost_species ${sql(row)} ON CONFLICT (scientific_name) DO UPDATE SET
      common_name = EXCLUDED.common_name, class_name = EXCLUDED.class_name, order_name = EXCLUDED.order_name, family = EXCLUDED.family,
      subspecies = EXCLUDED.subspecies, continent = EXCLUDED.continent, countries = EXCLUDED.countries, region = EXCLUDED.region,
      red_list = EXCLUDED.red_list, on_rewild_list = EXCLUDED.on_rewild_list, source = EXCLUDED.source, updated_at = now() RETURNING id`;
    await sql`INSERT INTO lost_names (name, lost_id, via) VALUES (${nameKeys(r.scientific_name)[0]}, ${id}, 'list') ON CONFLICT (name) DO NOTHING`;
    n++;
  }
  // Extra names (renames, synonyms) a person checked: name,listed_name,reason
  let extra = 0;
  try {
    for (const r of parseCsv(readFileSync("src/data/lost-species-names.csv", "utf8"))) {
      const [s] = await sql<{ id: number }[]>`SELECT id FROM lost_species WHERE scientific_name = ${r.listed_name}`;
      if (!s || !r.name) { console.log(`skipped extra name ${r.name}: ${r.listed_name} is not on the list`); continue; }
      await sql`INSERT INTO lost_names (name, lost_id, via) VALUES (${nameKeys(r.name)[0]}, ${s.id}, 'approved') ON CONFLICT (name) DO UPDATE SET lost_id = EXCLUDED.lost_id, via = 'approved'`;
      extra++;
    }
  } catch { /* no approved names yet */ }
  console.log(`${n} lost species, ${extra} approved extra names`);
} else if (cmd === "check-names") {
  // GBIF's view of each name. Rows to look at: no exact match, or GBIF treats the name as a synonym of another species.
  const out = ["listed_name,class,gbif_match,gbif_status,gbif_accepted_name,note"];
  let i = 0;
  for (const r of list) {
    const m = await gbifJson<{ matchType?: string; status?: string; species?: string; canonicalName?: string; rank?: string }>("/species/match", new URLSearchParams({ name: r.scientific_name, verbose: "false" }), 3).catch(() => null);
    const accepted = m?.species ?? m?.canonicalName ?? "";
    let note = "";
    if (!m || m.matchType === "NONE") note = "GBIF does not know this name; records may arrive under another name";
    else if (m.matchType !== "EXACT") note = `GBIF matched ${m.matchType?.toLowerCase()}`;
    else if (m.status !== "ACCEPTED" && accepted && accepted !== r.scientific_name) note = "GBIF files this name under another species: check before watching that name (it may be a common species)";
    if (note) out.push([r.scientific_name, r.class, m?.matchType ?? "", m?.status ?? "", accepted, note].map((v) => (/[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","));
    if (++i % 100 === 0) console.log(`${i} of ${list.length}`);
  }
  writeFileSync("lost-species-name-check.csv", out.join("\n") + "\n");
  console.log(`${out.length - 1} names to look at, in lost-species-name-check.csv (not committed: keep it local)`);
} else if (cmd === "hold-existing") {
  const apply = process.argv.includes("--apply");
  const names = (await sql<{ name: string; lost_id: number }[]>`SELECT name, lost_id FROM lost_names`);
  if (!names.length) { console.log("Run load first."); process.exit(1); }
  const ids = new Map(names.map((n) => [n.name, n.lost_id]));
  const watch = names.map((n) => n.name);
  const bin = sql`lower(split_part(scientific_name, ' ', 1) || ' ' || split_part(scientific_name, ' ', 2))`;
  const match = sql`(lower(scientific_name) = ANY(${watch}) OR ${bin} = ANY(${watch}))`;
  const idOf = (name: string) => { for (const k of nameKeys(name)) if (ids.has(k)) return ids.get(k)!; return null; };
  // Aggregates first: counts per cell and day or week. Then single records.
  for (const t of ["species_daily", "species_weekly"] as const) {
    const col = t === "species_daily" ? "day" : "week";
    const rows = await sql<{ p: string; source_system: string; scientific_name: string; cell_lat: number; cell_lon: number; count: number }[]>`
      SELECT ${sql(col)}::text AS p, source_system, scientific_name, cell_lat, cell_lon, count FROM ${sql(t)} WHERE ${match}`;
    console.log(`${t}: ${rows.length} rows`, rows.map((r) => `${r.scientific_name} ${r.source_system} ${r.p}`).join("; "));
    if (apply && rows.length) {
      const flags = rows.map((r) => ({ flag_key: `count:${r.source_system}:${col} ${r.p}:${r.cell_lat + 2.5}:${r.cell_lon + 2.5}:${r.scientific_name.toLowerCase()}`,
        lost_id: idOf(r.scientific_name)!, name_received: r.scientific_name, kind: "count", source_system: r.source_system, period: `${col} ${r.p}`,
        latitude: r.cell_lat + 2.5, longitude: r.cell_lon + 2.5, count: r.count, detail: sql.json({ movedFrom: t }) }));
      await sql`INSERT INTO lost_flags ${sql(flags)} ON CONFLICT (flag_key) DO NOTHING`;
      await sql`DELETE FROM ${sql(t)} WHERE ${match}`;
    }
  }
  const ev = await sql<{ event_id: string; source_system: string; source_record_id: string | null; source_provider_url: string | null; event_start: Date; scientific_name: string; latitude: number; longitude: number; confidence: number; media_type: string | null; media_url: string | null }[]>`
    SELECT event_id, source_system, source_record_id, source_provider_url, event_start, scientific_name, latitude, longitude, confidence, media_type, media_url FROM events WHERE ${match}`;
  console.log(`events: ${ev.length} rows`);
  if (apply && ev.length) {
    await sql`INSERT INTO lost_flags ${sql(ev.map((e) => ({ flag_key: `record:${e.event_id}`, lost_id: idOf(e.scientific_name)!, name_received: e.scientific_name, kind: "record",
      source_system: e.source_system, source_record: e.source_record_id, source_url: e.source_provider_url, observed_at: e.event_start, latitude: e.latitude, longitude: e.longitude,
      confidence: e.confidence, media_type: e.media_type, media_url: e.media_url, detail: sql.json({ movedFrom: "events" }) })))} ON CONFLICT (flag_key) DO NOTHING`;
    await sql`DELETE FROM events WHERE ${match}`;
  }
  for (const t of ["dataset_records", "bw_optin_daily", "station_weekly", "phenology", "arrival_candidates"]) {
    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM ${sql(t)} WHERE ${match}`;
    console.log(`${t}: ${n} rows${n ? " (not moved automatically: look at these by hand)" : ""}`);
  }
  if (!apply) console.log("Dry run. Add --apply to move the rows above into the review queue.");
} else {
  console.log("Usage: lost-species.mts load | check-names | hold-existing [--apply]");
}
await sql.end();
