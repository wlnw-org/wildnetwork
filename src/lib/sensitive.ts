import { readFileSync } from "node:fs";
import { join } from "node:path";

let cache: Set<string> | null = null;

/** Parses scripts/sensitive_species.txt: one scientific name per line, # comments, case-insensitive. */
export function parseSensitive(text: string): Set<string> {
  return new Set(text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.toLowerCase()));
}

/** Same list the open-data export uses. A missing file means no species are listed. */
export function isSensitive(scientificName: string): boolean {
  if (!cache) {
    try { cache = parseSensitive(readFileSync(join(process.cwd(), "scripts/sensitive_species.txt"), "utf8")); }
    catch { cache = new Set(); }
  }
  return cache.has(scientificName.trim().toLowerCase());
}
