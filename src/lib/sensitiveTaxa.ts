import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Parses scripts/sensitive_species.txt: one taxon per line (species, genus or family), # comments, case-insensitive. */
export function parseSensitiveTaxa(text: string): Set<string> {
  return new Set(text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.toLowerCase()));
}

let cache: Set<string> | null = null;
function list(): Set<string> {
  if (!cache) {
    try { cache = parseSensitiveTaxa(readFileSync(join(process.cwd(), "scripts/sensitive_species.txt"), "utf8")); }
    catch { cache = new Set(); }
  }
  return cache;
}

/** True when any of the record's names (species, genus, family, order) is on the list. */
export function isSensitiveTaxon(names: (string | null | undefined)[], taxa: Set<string> = list()): boolean {
  return names.some((n) => !!n && taxa.has(n.trim().toLowerCase()));
}

/** True when a scientific name (or its genus) is on the list. */
export const isSensitiveName = (sci: string | null | undefined): boolean => !!sci && isSensitiveTaxon([sci, sci.trim().split(/\s+/)[0]]);

/** Protected species are never shown or stored finer than whole degrees (about 110 km). */
export const SENSITIVE_ROUND_DEGREES = 1;
