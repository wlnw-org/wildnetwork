import { readFile } from "node:fs/promises";

/**
 * Climate context per 5 degree cell: temperature anomaly (NASA GISTEMP v4) and rainfall (NOAA GPCP v2.3), both against
 * the 1991-2020 normal of the same calendar month. Built monthly by scripts/climate.py into CLIMATE_FILE (a JSON file,
 * not database rows). Context only: no measure on the site uses it. Definitions at /methods#climate.
 */
export const CLIMATE_FILE = process.env.CLIMATE_FILE ?? "/var/lib/wlnw/climate/climate.json";
export const CLIMATE = { BASE: "1991-2020", WINDOW: 12, MIN_MONTHS_YEAR: 10 };

type Doc = {
  generated: string; base: string; t_start: string; t_end: string; p_start: string; p_end: string;
  sources: { temperature: string; rainfall: string };
  cells: Record<string, { t?: (number | null)[]; p?: (number | null)[]; pn?: (number | null)[] }>;
};

let cache: { at: number; doc: Doc | null } | null = null;
async function load(): Promise<Doc | null> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.doc;
  const doc = await readFile(CLIMATE_FILE, "utf8").then((s) => JSON.parse(s) as Doc).catch(() => null);
  cache = { at: Date.now(), doc };
  return doc;
}

const ym = (s: string) => { const [y, m] = s.split("-").map(Number); return { y, m }; };
const label = (start: string, i: number) => { const { y, m } = ym(start); const k = y * 12 + (m - 1) + i; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`; };
const monthOf = (start: string, i: number) => (ym(start).m - 1 + i) % 12;
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Mean temperature anomaly and rainfall vs normal (percent) over months [from, to] (indexes into each series). */
function window(doc: Doc, c: Doc["cells"][string], months: number) {
  let tAnom: number | null = null, pPct: number | null = null, tFrom = "", tTo = "";
  if (c.t?.length) {
    const end = c.t.length - 1, vals: number[] = [];
    for (let i = end - months + 1; i <= end; i++) { const v = c.t[i]; if (v != null) vals.push(v); }
    if (vals.length >= months - 2) tAnom = round(vals.reduce((a, b) => a + b, 0) / vals.length);
    tFrom = label(doc.t_start, end - months + 1); tTo = label(doc.t_start, end);
  }
  if (c.p?.length && c.pn) {
    const end = c.p.length - 1; let sum = 0, norm = 0, n = 0;
    for (let i = end - months + 1; i <= end; i++) {
      const v = c.p[i], nv = c.pn[monthOf(doc.p_start, i)];
      if (v != null && nv != null) { sum += v; norm += nv; n++; }
    }
    if (n >= months - 2 && norm > 0.05) pPct = Math.round(((sum - norm) / norm) * 100);
  }
  return { tAnom, pPct, from: tFrom, to: tTo };
}

export async function cellClimate(lat: number, lon: number) {
  const doc = await load();
  if (!doc) return null;
  const cell = { lat: Math.floor(lat / 5) * 5, lon: Math.floor(lon / 5) * 5 };
  const c = doc.cells[`${cell.lat},${cell.lon}`];
  if (!c) return null;
  const years: { year: number; tAnom: number | null; pPct: number | null }[] = [];
  const first = ym(doc.t_start).y, last = ym(doc.t_end).y;
  for (let y = first; y <= last; y++) {
    const ti: number[] = [];
    let ps = 0, pn = 0, pc = 0;
    for (let m = 0; m < 12; m++) {
      const it = (y - first) * 12 + m - (ym(doc.t_start).m - 1);
      const tv = c.t?.[it]; if (tv != null) ti.push(tv);
      const ip = (y - ym(doc.p_start).y) * 12 + m - (ym(doc.p_start).m - 1);
      const pv = c.p?.[ip], nv = c.pn?.[m];
      if (pv != null && nv != null) { ps += pv; pn += nv; pc++; }
    }
    years.push({
      year: y,
      tAnom: ti.length >= CLIMATE.MIN_MONTHS_YEAR ? round(ti.reduce((a, b) => a + b, 0) / ti.length) : null,
      pPct: pc >= CLIMATE.MIN_MONTHS_YEAR && pn > 0.05 ? Math.round(((ps - pn) / pn) * 100) : null,
    });
  }
  const recent: { month: string; tAnom: number | null; rain: number | null; rainNormal: number | null }[] = [];
  const n = c.t?.length ?? 0;
  for (let i = Math.max(0, n - 24); i < n; i++) {
    const month = label(doc.t_start, i);
    const ip = i + (ym(doc.t_start).y - ym(doc.p_start).y) * 12 + (ym(doc.t_start).m - ym(doc.p_start).m);
    recent.push({ month, tAnom: c.t?.[i] ?? null, rain: c.p?.[ip] ?? null, rainNormal: c.pn?.[monthOf(doc.t_start, i)] ?? null });
  }
  return { cell, base: doc.base, last12: window(doc, c, CLIMATE.WINDOW), years, recent, updated: doc.generated, sources: doc.sources };
}

let gridCache: { at: number; data: unknown } | null = null;
export async function climateGrid() {
  if (gridCache && Date.now() - gridCache.at < 3_600_000) return gridCache.data as Awaited<ReturnType<typeof build>>;
  const data = await build();
  gridCache = { at: Date.now(), data };
  return data;
}
async function build() {
  const doc = await load();
  if (!doc) return null;
  const cells: { lat: number; lon: number; t: number | null; p: number | null }[] = [];
  let from = "", to = "";
  for (const [k, c] of Object.entries(doc.cells)) {
    const w = window(doc, c, CLIMATE.WINDOW);
    if (w.tAnom == null && w.pPct == null) continue;
    if (w.to) { from = w.from; to = w.to; }
    const [lat, lon] = k.split(",").map(Number);
    cells.push({ lat, lon, t: w.tAnom, p: w.pPct });
  }
  return { base: doc.base, from, to, updated: doc.generated, cells };
}
