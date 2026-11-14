// Tracked journeys from the Movebank Data Repository (published GPS datasets, CC0 or CC BY; no account needed).
// Usage: tsx scripts/tracks.mts catalogue          -> TRACKS_DIR/catalogue.json (datasets, species, licence, GPS file sizes)
//        tsx scripts/tracks.mts build [maxMb=600]  -> TRACKS_DIR/<slug>.json per species + index.json
// Positions are rounded to 0.1 degree (about 10 km) so no nest or roost can be pinpointed.
// One point per animal per UTC day, at most PER_SPECIES animals per species (longest tracks first), sensitive species skipped.
// Runs on the server (downloads tens of GB once); TRACKS_DIR defaults to /var/lib/wlnw/tracks.
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { join } from "node:path";

const API = "https://datarepository.movebank.org/server/api";
const DIR = process.env.TRACKS_DIR ?? "/var/lib/wlnw/tracks";
const PER_SPECIES = 12, MAX_DAYS = 3 * 366;
mkdirSync(DIR, { recursive: true });
const UA = { "user-agent": "WildlifeNetwork/0.1 (+https://wlnw.org)" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json(url: string) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (r?.ok) return r.json();
    await sleep(2000 * (i + 1));
  }
  throw new Error(`failed ${url}`);
}

type Dataset = { uuid: string; title: string; doi: string | null; citation: string; licence: "CC0" | "CC BY" | "other"; species: string[]; animals: number;
  gps: { name: string; url: string; bytes: number } | null };

const m = (meta: Record<string, { value: string }[]>, k: string) => (meta[k] ?? []).map((x) => x.value);

async function catalogue() {
  const out: Dataset[] = [];
  for (let page = 0; ; page++) {
    const d = await json(`${API}/discover/search/objects?dsoType=ITEM&size=100&page=${page}`);
    const objs = d._embedded.searchResult._embedded.objects as { _embedded: { indexableObject: { uuid: string; name: string; metadata: Record<string, { value: string }[]> } } }[];
    for (const o of objs) {
      const it = o._embedded.indexableObject, meta = it.metadata;
      if (m(meta, "dspace.entity.type")[0] !== "Datapackage") continue;
      const rights = m(meta, "dc.rights.uri")[0] ?? m(meta, "dc.rights")[0] ?? "";
      const licence = /zero|CC0/i.test(rights) ? "CC0" : /\/by\/|CC BY 4|Attribution 4/i.test(rights) && !/nc/i.test(rights) ? "CC BY" : "other";
      out.push({ uuid: it.uuid, title: it.name, doi: m(meta, "dc.identifier.doi")[0] ?? null, citation: m(meta, "mdr.citation.CSE")[0] ?? it.name, licence,
        species: [...new Set(m(meta, "dwc.ScientificName"))], animals: Number(m(meta, "mdr.animal.count")[0] ?? 0), gps: null });
    }
    if (page + 1 >= d._embedded.searchResult.page.totalPages) break;
  }
  for (const ds of out) {
    const b = await json(`${API}/core/items/${ds.uuid}/bundles`);
    const orig = (b._embedded.bundles as { name: string; _links: { bitstreams: { href: string } } }[]).find((x) => x.name === "ORIGINAL");
    if (!orig) continue;
    const bs = await json(orig._links.bitstreams.href + "?size=100");
    const files = (bs._embedded.bitstreams as { name: string; sizeBytes: number; _links: { content: { href: string } } }[]);
    const gps = files.find((f) => /gps\.csv(\.zip)?$/i.test(f.name)) ?? files.find((f) => /\.csv(\.zip)?$/i.test(f.name) && !/reference|acc|mag|gyro/i.test(f.name));
    if (gps) ds.gps = { name: gps.name, url: gps._links.content.href, bytes: gps.sizeBytes };
    await sleep(200);
  }
  writeFileSync(join(DIR, "catalogue.json"), JSON.stringify(out));
  const ok = out.filter((d) => d.licence !== "other" && d.gps);
  console.log(`${out.length} datasets, ${ok.length} open with a GPS file, ${(ok.reduce((s, d) => s + d.gps!.bytes, 0) / 1e9).toFixed(1)} GB,`,
    `${new Set(ok.flatMap((d) => d.species)).size} species; licences`, Object.fromEntries(["CC0", "CC BY", "other"].map((l) => [l, out.filter((d) => d.licence === l).length])));
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Stream one GPS CSV (zipped or not) into daily points per animal. */
async function readDataset(ds: Dataset, file: string): Promise<Map<string, { species: string; days: Map<string, [number, number]> }>> {
  const input = ds.gps!.name.endsWith(".zip") ? spawn("unzip", ["-p", file], { stdio: ["ignore", "pipe", "ignore"] }).stdout : createReadStream(file);
  const rl = createInterface({ input, crlfDelay: Infinity });
  const animals = new Map<string, { species: string; days: Map<string, [number, number]> }>();
  let I: Record<string, number> | null = null;
  const split = (line: string) => (line.includes('"') ? line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "")) : line.split(","));
  for await (const line of rl) {
    const f = split(line);
    if (!I) {
      const c = (n: string) => f.indexOf(n);
      I = { t: c("timestamp"), lon: c("location-long"), lat: c("location-lat"), id: c("individual-local-identifier"), sp: c("individual-taxon-canonical-name"), vis: c("visible") };
      if (I.t < 0 || I.lon < 0 || I.lat < 0 || I.id < 0) { rl.close(); break; }
      continue;
    }
    if (I.vis >= 0 && f[I.vis] === "false") continue;
    const lat = Number(f[I.lat]), lon = Number(f[I.lon]);
    if (!f[I.lat] || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const day = f[I.t].slice(0, 10);
    const id = `${ds.uuid}:${f[I.id]}`;
    let a = animals.get(id);
    if (!a) animals.set(id, (a = { species: (I.sp >= 0 && f[I.sp]) || ds.species[0] || "", days: new Map() }));
    if (!a.days.has(day)) a.days.set(day, [Math.round(lon * 10) / 10, Math.round(lat * 10) / 10]);
  }
  return animals;
}

async function build(maxMb: number) {
  const cat: Dataset[] = JSON.parse(readFileSync(join(DIR, "catalogue.json"), "utf8"));
  const listed = readFileSync("scripts/sensitive_species.txt", "utf8").split("\n").map((s) => s.trim().toLowerCase()).filter((s) => s && !s.startsWith("#"));
  // Families in the list, as genera (Movebank gives species names only).
  const FAMILY_GENERA: Record<string, string[]> = { cheloniidae: ["caretta", "chelonia", "eretmochelys", "lepidochelys", "natator"], dermochelyidae: ["dermochelys"], pristidae: ["pristis", "anoxypristis"] };
  const sensitiveSet = new Set(listed.flatMap((t) => FAMILY_GENERA[t] ?? [t]));
  const sensitive = { has: (name: string) => sensitiveSet.has(name) || sensitiveSet.has(name.split(" ")[0]) };
  type Track = { dataset: string; animal: string; from: string; to: string; points: [number, number][]; dates: string[] };
  const bySpecies = new Map<string, Track[]>();
  const todo = cat.filter((d) => d.licence !== "other" && d.gps && d.gps.bytes <= maxMb * 1e6 && !d.species.some((s) => sensitive.has(s.toLowerCase())));
  console.log(`${todo.length} datasets to read`);
  const tmp = join(DIR, "download.tmp");
  for (const [k, ds] of todo.entries()) {
    try {
      const r = await fetch(ds.gps!.url, { headers: UA, signal: AbortSignal.timeout(30 * 60_000) });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      await pipeline(Readable.fromWeb(r.body as never), createWriteStream(tmp));
      const animals = await readDataset(ds, tmp);
      for (const [id, a] of animals) {
        const name = a.species.split(" ").slice(0, 2).join(" ");
        if (!name.includes(" ") || sensitive.has(name.toLowerCase()) || a.days.size < 20) continue;
        const dates = [...a.days.keys()].sort().slice(-MAX_DAYS);
        const list = bySpecies.get(name) ?? [];
        list.push({ dataset: ds.uuid, animal: id.split(":").slice(1).join(":"), from: dates[0], to: dates[dates.length - 1], points: dates.map((d) => a.days.get(d)!), dates });
        list.sort((x, y) => y.dates.length - x.dates.length);
        bySpecies.set(name, list.slice(0, PER_SPECIES));
      }
      console.log(`${k + 1}/${todo.length} ${ds.title.slice(0, 60)}: ${animals.size} animals`);
    } catch (e) { console.error(`${ds.title}: ${String(e)}`); }
    if (existsSync(tmp)) rmSync(tmp);
  }
  const byId = new Map(cat.map((d) => [d.uuid, d]));
  const index: Record<string, { slug: string; animals: number; datasets: number; from: string; to: string }> = {};
  for (const [name, tracks] of bySpecies) {
    const ds = [...new Set(tracks.map((t) => t.dataset))].map((u) => byId.get(u)!);
    const file = { species: name, tracks, datasets: ds.map((d) => ({ id: d.uuid, title: d.title, doi: d.doi, citation: d.citation, licence: d.licence })) };
    writeFileSync(join(DIR, `${slug(name)}.json`), JSON.stringify(file));
    index[name] = { slug: slug(name), animals: tracks.length, datasets: ds.length, from: tracks.map((t) => t.from).sort()[0], to: tracks.map((t) => t.to).sort().at(-1)! };
  }
  writeFileSync(join(DIR, "index.json"), JSON.stringify(index));
  console.log(`done: ${Object.keys(index).length} species`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "catalogue") await catalogue();
else if (cmd === "build") await build(Number(arg ?? 600));
else console.log("usage: tracks.mts catalogue | build [maxMb]");
