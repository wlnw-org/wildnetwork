// Pure name matching for the lost species watch (src/lib/lost.ts), kept free of database imports so it can be tested.

/** The names a received name is checked under: itself, and its species (first two words) when it is a subspecies.
 *  A listed subspecies is only matched by its full name, so the common nominate species is never flagged for it. */
export function nameKeys(name: string | null | undefined): string[] {
  const n = (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!n) return [];
  const w = n.split(" ");
  return w.length > 2 ? [n, `${w[0]} ${w[1]}`] : [n];
}

export function matchLost(name: string | null | undefined, names: Map<string, number>): number | null {
  for (const k of nameKeys(name)) { const id = names.get(k); if (id !== undefined) return id; }
  return null;
}

/** A list entry can carry an alternative name, as in "Cabalus lafresnayanus (Gallirallus lafresnayanus)" or
 *  "Chamaeleon monoceras, Furcifer monoceras". Both are the list's own names for the species, so both are watched. */
export function listedNames(entry: string): string[] {
  return [...new Set(entry.split(/\s*[(),]\s*/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2).map((x) => nameKeys(x)[0]))];
}
