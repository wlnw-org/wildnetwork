import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Tracked journeys: GPS tracks of tagged animals from the Movebank Data Repository (CC0 / CC BY datasets), one point per
 * animal per day, rounded to 0.1 degree, at most 12 animals per species. Built on the server by scripts/tracks.mts into
 * TRACKS_DIR (not the database: about 50 MB of JSON that changes only when the build is rerun).
 */
export const TRACKS_DIR = process.env.TRACKS_DIR ?? "/var/lib/wlnw/tracks";
export const trackSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type TrackFile = {
  species: string;
  tracks: { dataset: string; animal: string; from: string; to: string; points: [number, number][]; dates: string[] }[];
  datasets: { id: string; title: string; doi: string | null; citation: string; licence: string }[];
};
export type TrackIndex = Record<string, { slug: string; animals: number; datasets: number; from: string; to: string }>;

let indexCache: { at: number; data: TrackIndex } | null = null;
export async function trackIndex(): Promise<TrackIndex> {
  if (indexCache && Date.now() - indexCache.at < 3_600_000) return indexCache.data;
  const data = await readFile(join(TRACKS_DIR, "index.json"), "utf8").then((s) => JSON.parse(s) as TrackIndex).catch(() => ({}));
  indexCache = { at: Date.now(), data };
  return data;
}

/** Tracks for one species (binomial; subspecies names fall back to it), or null. */
export async function speciesTracks(name: string): Promise<TrackFile | null> {
  const idx = await trackIndex();
  const key = idx[name] ? name : name.split(" ").slice(0, 2).join(" ");
  if (!idx[key]) return null;
  return readFile(join(TRACKS_DIR, `${idx[key].slug}.json`), "utf8").then((s) => JSON.parse(s) as TrackFile).catch(() => null);
}
