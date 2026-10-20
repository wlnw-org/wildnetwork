/**
 * Reference recordings from xeno-canto (API v3, https://xeno-canto.org/explore/api).
 * XC's terms for this use: official API only, credit the recordist, follow each recording's CC licence,
 * play and link the audio from xeno-canto (never copy, trim, re-host or re-encode it), non-commercial.
 * This file is pure (no database) so it can be tested with a mocked fetch.
 */

export const XC_API = "https://xeno-canto.org/api/3/recordings";
export const XC_AREAS = ["africa", "america", "asia", "australia", "europe"] as const;
export type XcArea = (typeof XC_AREAS)[number];
export const MAX_CLIPS = 2;

/** Our class (species_group.grp) to XC's grp tag. Classes XC does not cover are not queried. */
const XC_GROUP: Record<string, string> = { avian: "birds", bat: "bats", amphibian: "frogs", insect: "grasshoppers", mammal: '"land mammals"' };

export interface XcClip {
  id: string;
  url: string;          // recording page on xeno-canto
  file: string;         // audio URL served by xeno-canto, streamed as is
  sonogram: string | null;
  type: string;
  quality: string;
  seconds: number | null;
  recordist: string;
  location: string;
  country: string;
  license: { name: string; url: string };
}

interface XcRecording {
  id?: string; gen?: string; sp?: string; en?: string; rec?: string; cnt?: string; loc?: string; type?: string;
  q?: string; length?: string; file?: string | null; url?: string; lic?: string; status?: string;
  sono?: { small?: string; med?: string; large?: string; full?: string };
  _meta?: { redacted_fields?: Record<string, string> };
}

/** Our continent names (REGION in methods.ts) and XC's world areas. Only a continent ever leaves the browser. */
export function areaFor(lon: number, lat: number): XcArea {
  if (lon < -30) return "america";
  if (lon < 60) return lat >= 35 ? "europe" : "africa";
  if (lon >= 110 && lat < -10) return "australia";
  return "asia";
}

export function isArea(s: string | null | undefined): s is XcArea {
  return !!s && (XC_AREAS as readonly string[]).includes(s);
}

/** Search string with XC tags. Only the binomial is used: we do not store subspecies. q:">C" means A or B. */
export function buildQuery(scientificName: string, group: string | null, area: XcArea | null): string | null {
  const [gen, sp] = scientificName.trim().toLowerCase().split(/\s+/);
  if (!gen || !sp || !/^[a-z-]+$/.test(gen + sp)) return null;
  const grp = group ? XC_GROUP[group] : XC_GROUP.avian;
  if (group && !grp) return null;
  return [`gen:${gen}`, `sp:${sp}`, `grp:${grp}`, `q:">C"`, area && `area:${area}`].filter(Boolean).join(" ");
}

/** "4:08" or "1:02:03" to seconds. */
export function parseLength(s: string | undefined): number | null {
  if (!s || !/^\d+(:\d+){0,2}$/.test(s)) return null;
  return s.split(":").reduce((a, p) => a * 60 + Number(p), 0);
}

const https = (u: string | undefined | null) => (u ? (u.startsWith("//") ? `https:${u}` : u) : "");

/** Creative Commons licence URL to its short name, e.g. .../licenses/by-nc-sa/4.0/ -> "CC BY-NC-SA 4.0". */
export function licenseInfo(lic: string | undefined): { name: string; url: string } | null {
  const url = https(lic);
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d+(?:\.\d+)?)/i.exec(url);
  if (!m) return null;
  const code = m[2].toLowerCase();
  const name = m[1] === "publicdomain" ? (code === "zero" ? `CC0 ${m[3]}` : `Public Domain Mark ${m[3]}`) : `CC ${code.toUpperCase()} ${m[3]}`;
  return { name, url };
}

/** One line of credit: "Recordist, Locality, Country". Empty parts are left out. */
export function creditLine(c: Pick<XcClip, "recordist" | "location" | "country">): string {
  return [c.recordist, c.location, c.country].map((s) => s.trim()).filter(Boolean).join(", ");
}

/** Recordings XC returned that we can play: identified, not redacted, with an https audio URL and a known CC licence. */
export function parseResponse(json: unknown, scientificName: string): XcClip[] {
  const recs = (json as { recordings?: XcRecording[] } | null)?.recordings;
  if (!Array.isArray(recs)) return [];
  const [gen, sp] = scientificName.toLowerCase().split(/\s+/);
  const out: XcClip[] = [];
  for (const r of recs) {
    if (r._meta?.redacted_fields?.file) continue;
    if (r.status && r.status !== "identified") continue;
    if (r.gen?.toLowerCase() !== gen || r.sp?.toLowerCase() !== sp) continue;
    const file = https(r.file), url = https(r.url) || (r.id ? `https://xeno-canto.org/${r.id}` : "");
    const license = licenseInfo(r.lic);
    if (!r.id || !/^\d+$/.test(r.id) || !/^https:\/\/xeno-canto\.org\//.test(file) || !license) continue;
    const sono = https(r.sono?.med || r.sono?.small);
    out.push({
      id: r.id, url: /^https:\/\/xeno-canto\.org\//.test(url) ? url : `https://xeno-canto.org/${r.id}`, file,
      sonogram: /^https:\/\/xeno-canto\.org\//.test(sono) ? sono : null,
      type: (r.type ?? "").trim(), quality: (r.q ?? "").trim().toUpperCase(), seconds: parseLength(r.length),
      recordist: (r.rec ?? "").trim(), location: (r.loc ?? "").trim(), country: (r.cnt ?? "").trim(), license,
    });
  }
  return out;
}

/** Lower is better. Bird detections are mostly songs, then calls; bats are mostly echolocation. */
function typeRank(type: string, group: string | null): number {
  const t = type.toLowerCase();
  const order = group === "bat" ? ["echolocation", "social call"] : group === "insect" ? ["calling song", "song"] : ["song", "call"];
  const i = order.findIndex((o) => t.split(/\s*,\s*/).some((p) => p === o || p.endsWith(` ${o}`)));
  return i < 0 ? order.length : i;
}

/** Long enough to hear the pattern, short enough to play through: 10 to 60 s is best, then 5 to 10 or 60 to 180 s. */
function lengthRank(s: number | null): number {
  if (s == null) return 3;
  if (s >= 10 && s <= 60) return 0;
  return s >= 5 && s <= 180 ? 1 : 2;
}

/**
 * Quality A before B, then sound type, then length (closest to 30 s). Picks prefer different recordists, so two clips
 * are two voices rather than one person's session. Clips from the same area come first when the caller passes them first.
 */
export function rankClips(clips: XcClip[], group: string | null, limit = MAX_CLIPS): XcClip[] {
  const qr = (q: string) => (q === "A" ? 0 : q === "B" ? 1 : 2);
  const sorted = clips
    .map((c, i) => ({ c, i }))
    .sort((a, b) => qr(a.c.quality) - qr(b.c.quality) || typeRank(a.c.type, group) - typeRank(b.c.type, group)
      || lengthRank(a.c.seconds) - lengthRank(b.c.seconds) || Math.abs((a.c.seconds ?? 1e9) - 30) - Math.abs((b.c.seconds ?? 1e9) - 30) || a.i - b.i)
    .map((x) => x.c);
  const out: XcClip[] = [];
  for (const c of sorted) if (out.length < limit && !out.some((o) => o.recordist === c.recordist)) out.push(c);
  for (const c of sorted) if (out.length < limit && !out.includes(c)) out.push(c);
  return out;
}

export class XcError extends Error {}

/** One API call. Throws XcError on a network error, timeout, non-200 or an error payload, so the caller does not cache it. */
async function query(q: string, key: string, fetcher: typeof fetch, timeoutMs: number): Promise<unknown> {
  const u = `${XC_API}?query=${encodeURIComponent(q)}&per_page=100&key=${encodeURIComponent(key)}`;
  let r: Response;
  try {
    r = await fetcher(u, { headers: { "user-agent": "wildnetwork/0.1 (https://github.com/wlnw-org/wildnetwork)" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new XcError(`xeno-canto unreachable: ${(e as Error).name}`);
  }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || (j as { error?: unknown }).error) throw new XcError(`xeno-canto error ${r.status}`);
  return j;
}

/**
 * Up to MAX_CLIPS clips for a species: the best from the given area first, topped up from anywhere.
 * Returns [] when XC has nothing (safe to cache); throws XcError when XC failed (do not cache).
 */
export async function fetchClips(scientificName: string, group: string | null, area: XcArea | null, key: string, fetcher: typeof fetch = fetch, timeoutMs = 4000): Promise<XcClip[]> {
  const local = area ? buildQuery(scientificName, group, area) : null;
  const any = buildQuery(scientificName, group, null);
  if (!any) return [];
  let picked: XcClip[] = [];
  if (local) picked = rankClips(parseResponse(await query(local, key, fetcher, timeoutMs), scientificName), group);
  if (picked.length < MAX_CLIPS) {
    const more = rankClips(parseResponse(await query(any, key, fetcher, timeoutMs), scientificName), group, MAX_CLIPS + picked.length);
    picked = [...picked, ...more.filter((c) => !picked.some((p) => p.id === c.id))].slice(0, MAX_CLIPS);
  }
  return picked;
}
