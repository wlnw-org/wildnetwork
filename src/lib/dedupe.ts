/**
 * Cross-aggregator identity. OBIS republishes many GBIF and iNaturalist occurrences, so the same animal can arrive twice.
 * Records are matched on Darwin Core occurrenceID plus institutionCode; iNaturalist observations are matched on their
 * observation number, whichever aggregator carries them. Matching records are kept once and credit both sources.
 */
const INAT = /^https?:\/\/(?:www\.)?inaturalist\.org\/observations\/(\d+)\/?$/i;

export function dedupeKey(source: string, sourceRecordId?: string | null, occurrenceId?: string | null, institutionCode?: string | null): string | null {
  if (source === "inaturalist" && sourceRecordId) return `inaturalist:${sourceRecordId}`;
  const occ = (occurrenceId ?? "").trim();
  if (!occ) return null;
  const inat = INAT.exec(occ);
  if (inat) return `inaturalist:${inat[1]}`;
  return `${occ.toLowerCase()}|${(institutionCode ?? "").trim().toLowerCase()}`;
}

/** Splits incoming rows into new ones and ones already held under another source (by dedupe key). */
export function splitDuplicates<T extends { dedupe_key: string | null; source_system: string }>(
  rows: T[], existing: Map<string, { event_id: string; source_system: string }>,
): { fresh: T[]; merged: { row: T; into: string }[] } {
  const fresh: T[] = [], merged: { row: T; into: string }[] = [];
  for (const r of rows) {
    const hit = r.dedupe_key ? existing.get(r.dedupe_key) : undefined;
    if (hit && hit.source_system !== r.source_system) merged.push({ row: r, into: hit.event_id });
    else fresh.push(r);
  }
  return { fresh, merged };
}
