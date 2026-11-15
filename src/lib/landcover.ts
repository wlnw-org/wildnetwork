import { readFile } from "node:fs/promises";

/**
 * Land cover share per 1 degree square from ESA WorldCover 2021 v200 (CC BY 4.0), built once by scripts/landcover.py into
 * LANDCOVER_FILE (a JSON file, not database rows; WorldCover is a fixed 2021 map, so rerun only for a new version).
 * Context only: no measure on the site uses it. Definitions at /methods#landcover.
 */
export const LANDCOVER_FILE = process.env.LANDCOVER_FILE ?? "/var/lib/wlnw/landcover/landcover.json";

type Doc = { generated: string; source: string; licence: string; classes: string[]; cells: Record<string, number[]> };

let cache: { at: number; doc: Doc | null } | null = null;
async function load(): Promise<Doc | null> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.doc;
  const doc = await readFile(LANDCOVER_FILE, "utf8").then((s) => JSON.parse(s) as Doc).catch(() => null);
  cache = { at: Date.now(), doc };
  return doc;
}

/** Shares (percent) for the 1 degree square holding a point, or null over open sea / without data. */
export async function cellLandcover(lat: number, lon: number) {
  const doc = await load();
  if (!doc) return null;
  const cell = { lat: Math.floor(lat), lon: Math.floor(lon) };
  const v = doc.cells[`${cell.lat},${cell.lon}`];
  if (!v) return null;
  return { cell, shares: Object.fromEntries(doc.classes.map((c, i) => [c, v[i]])), source: doc.source, licence: doc.licence };
}

/** Every square as [lat, lon, ...shares in class order], compact for the map. */
export async function landcoverGrid() {
  const doc = await load();
  if (!doc) return null;
  const cells = Object.entries(doc.cells).map(([k, v]) => { const [lat, lon] = k.split(",").map(Number); return [lat, lon, ...v]; });
  return { classes: doc.classes, source: doc.source, licence: doc.licence, generated: doc.generated, cells };
}
