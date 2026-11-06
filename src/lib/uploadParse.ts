// Reading detection tables in the browser before upload: BirdNET-Pi / BirdNET-Go exports, BirdNET-Analyzer result
// tables, Kaleidoscope id.csv and any CSV with a date, a species and a place. Pure, shared by the upload form and tests.

export interface Mapping {
  datetime?: number; date?: number; time?: number; offset?: number; file?: number;
  species: number[]; confidence?: number; site?: number; lat?: number; lon?: number; count?: number;
}
export interface UploadRow { site: string; lat: number; lon: number; ts: string; name: string; confidence: number | null; count: number; file: string | null }
export interface ParseOptions {
  utcOffsetHours: number;
  /** Used when the table has no site / coordinate columns (one recorder per file). */
  site?: string; lat?: number; lon?: number;
  minConf: number;
  /** Human observations carry no confidence. */
  method: "machine" | "human";
  /** File name of the CSV itself: BirdNET-Analyzer writes one table per recording, named after it. */
  sourceFile?: string;
}
export type SkipReason = "no species" | "not an animal" | "below confidence" | "no confidence" | "date not understood" | "no location" | "location out of range" | "in the future";

/** Splits CSV, semicolon or tab separated text, with quoted fields. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const first = clean.slice(0, clean.indexOf("\n") + 1 || clean.length);
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_*]+/g, " ").trim();
function find(headers: string[], names: string[]): number | undefined {
  const n = headers.map(norm);
  for (const want of names) { const i = n.indexOf(want); if (i >= 0) return i; }
  return undefined;
}

/** Guesses which column holds what, and names the format when it is a known one. */
export function guessMapping(headers: string[]): { format: string; mapping: Mapping } {
  const f = (...names: string[]) => find(headers, names);
  const species = [f("manual id"), f("scientific name", "sci name", "scientificname", "species", "taxon", "auto id")].filter((i): i is number => i !== undefined);
  const mapping: Mapping = {
    datetime: f("datetime", "timestamp", "begin time", "eventdate", "event date", "date time", "begin date time"),
    date: f("date"), time: f("time"), offset: f("offset", "start (s)", "begin time (s)"),
    file: f("file", "in file", "begin file", "filename", "begin path"),
    species, confidence: f("confidence", "score", "probability", "match ratio"),
    site: f("site", "station", "location", "folder", "deployment", "sensor", "device"),
    lat: f("lat", "latitude", "decimallatitude"), lon: f("lon", "lng", "longitude", "decimallongitude"),
    count: f("count", "individuals", "individualcount", "individual count"),
  };
  if (mapping.datetime !== undefined) { mapping.date = undefined; mapping.time = undefined; }
  const n = headers.map(norm);
  const format = n.includes("in file") && (n.includes("auto id") || n.includes("manual id")) ? "Kaleidoscope"
    : n.includes("sci name") && n.includes("com name") ? "BirdNET-Pi or BirdNET-Go"
    : n.includes("start (s)") && n.includes("scientific name") ? "BirdNET-Analyzer"
    : "CSV";
  return { format, mapping };
}

/** A date and time from a recorder's file name: SongMeter (PREFIX_20240501_053000), AudioMoth (20240501_053000), BirdNET-Pi (2024-05-01-birdnet-05:30:00). */
export function timeFromFileName(name: string): { date: string; time: string } | null {
  const base = name.split(/[\\/]/).pop() ?? name;
  let m = base.match(/(20\d{2})(\d{2})(\d{2})[_T-](\d{2})(\d{2})(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}:${m[6]}` };
  m = base.match(/(20\d{2})-(\d{2})-(\d{2})\D+(\d{2}):?(\d{2}):?(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}:${m[6]}` };
  return null;
}

/** Local date + time + offset (seconds) to an ISO UTC instant; null when the date is not ISO-like. */
export function toUtc(date: string, time: string | undefined, utcOffsetHours: number, offsetSeconds = 0): string | null {
  const d = date.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!d) return null;
  let [h, mi, s] = [Number(d[4] ?? 0), Number(d[5] ?? 0), Number(d[6] ?? 0)];
  if (time && time.trim()) {
    const t = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!t) return null;
    [h, mi, s] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  }
  let tz = utcOffsetHours * 60;
  if (d[7]) tz = d[7] === "Z" ? 0 : (d[7][0] === "-" ? -1 : 1) * (Number(d[7].slice(1, 3)) * 60 + Number(d[7].slice(-2)));
  const ms = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), h, mi, s) - tz * 60_000 + offsetSeconds * 1000;
  if (!Number.isFinite(ms) || Number(d[2]) > 12 || Number(d[3]) > 31 || h > 23 || mi > 59) return null;
  return new Date(ms).toISOString();
}

// BirdNET and other classifiers also report sounds that are not animals.
const NOT_ANIMAL = /^(nocall|noise|no ?id|nonbat|human|engine|siren|gun|fireworks|power tools|environmental|dog|vehicle|rain|wind)\b/i;

/** BirdNET writes "Turdus merula_Common Blackbird" in some exports: keep the scientific part. */
export const cleanName = (s: string) => s.split("_")[0].replace(/\s+/g, " ").trim();

export function toRows(table: string[][], mapping: Mapping, o: ParseOptions): { rows: UploadRow[]; skipped: Partial<Record<SkipReason, number>> } {
  const rows: UploadRow[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  const skip = (r: SkipReason) => { skipped[r] = (skipped[r] ?? 0) + 1; };
  const now = Date.now() + 86_400_000;
  const cell = (r: string[], i?: number) => (i === undefined ? "" : (r[i] ?? "").trim());
  const fileTime = o.sourceFile ? timeFromFileName(o.sourceFile) : null;
  for (const r of table) {
    const name = cleanName(mapping.species.map((i) => cell(r, i)).find((v) => v) ?? "");
    if (!name) { skip("no species"); continue; }
    if (NOT_ANIMAL.test(name)) { skip("not an animal"); continue; }
    let confidence: number | null = null;
    if (mapping.confidence !== undefined && cell(r, mapping.confidence) !== "") {
      confidence = Number(cell(r, mapping.confidence).replace(",", "."));
      if (confidence > 1 && confidence <= 100) confidence /= 100;
      if (!Number.isFinite(confidence)) confidence = null;
    }
    if (o.method === "machine") {
      if (confidence === null) { skip("no confidence"); continue; }
      if (confidence < o.minConf) { skip("below confidence"); continue; }
    }
    const offset = Number(cell(r, mapping.offset)) || 0;
    const file = cell(r, mapping.file) || o.sourceFile || "";
    let ts: string | null = null;
    if (mapping.datetime !== undefined) ts = toUtc(cell(r, mapping.datetime), undefined, o.utcOffsetHours);
    else if (mapping.date !== undefined) ts = toUtc(cell(r, mapping.date), cell(r, mapping.time), o.utcOffsetHours, offset);
    else {
      const ft = (file && timeFromFileName(file)) || fileTime;
      if (ft) ts = toUtc(ft.date, ft.time, o.utcOffsetHours, offset);
    }
    if (!ts) { skip("date not understood"); continue; }
    if (Date.parse(ts) > now) { skip("in the future"); continue; }
    const lat = mapping.lat !== undefined && cell(r, mapping.lat) !== "" ? Number(cell(r, mapping.lat)) : o.lat;
    const lon = mapping.lon !== undefined && cell(r, mapping.lon) !== "" ? Number(cell(r, mapping.lon)) : o.lon;
    if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) { skip("no location"); continue; }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) { skip("location out of range"); continue; }
    const site = (cell(r, mapping.site) || o.site || `${lat.toFixed(3)},${lon.toFixed(3)}`).slice(0, 80);
    const count = Math.max(1, Math.min(10_000, Math.round(Number(cell(r, mapping.count)) || 1)));
    rows.push({ site, lat, lon, ts, name: name.slice(0, 120), confidence, count, file: file ? file.split(/[\\/]/).pop()!.slice(0, 160) : null });
  }
  return { rows, skipped };
}
