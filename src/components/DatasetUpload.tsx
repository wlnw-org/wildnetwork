"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MapPick from "./MapPick";
import { guessMapping, parseCsv, toRows, type Mapping, type SkipReason, type UploadRow } from "@/lib/uploadParse";

const CHUNK = 2000;
const FIELDS: [keyof Mapping, string][] = [
  ["species", "Species"], ["datetime", "Date and time"], ["date", "Date"], ["time", "Time"], ["offset", "Seconds into file"],
  ["file", "Recording file"], ["confidence", "Confidence"], ["site", "Site"], ["lat", "Latitude"], ["lon", "Longitude"], ["count", "Count"],
];

interface Parsed { headers: string[]; format: string; mapping: Mapping; files: { name: string; table: string[][] }[] }
interface Match { input: string; scientificName: string | null }

/** Read detection tables in the browser, match the names, then send the rows in chunks. Nothing leaves the browser until "Upload". */
export default function DatasetUpload({ id, method, minConf }: { id: string; method: "machine" | "human"; minConf: number }) {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [opts, setOpts] = useState({ utcOffsetHours: "0", site: "", lat: "", lon: "" });
  const [result, setResult] = useState<{ rows: UploadRow[]; skipped: Partial<Record<SkipReason, number>> } | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [rename, setRename] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readFiles(list: FileList | null) {
    if (!list?.length) return;
    setResult(null); setMatches(null); setError(null);
    const files = await Promise.all([...list].map(async (f) => ({ name: f.name, table: parseCsv(await f.text()) })));
    const headers = files[0].table[0] ?? [];
    if (files.some((f) => (f.table[0] ?? []).join("|") !== headers.join("|"))) return setError("All files must have the same columns. Upload different formats one at a time.");
    const g = guessMapping(headers);
    setParsed({ headers, format: g.format, mapping: g.mapping, files: files.map((f) => ({ name: f.name, table: f.table.slice(1) })) });
  }

  function setCol(k: keyof Mapping, v: string) {
    if (!parsed) return;
    const m = { ...parsed.mapping };
    if (k === "species") m.species = v === "" ? [] : [Number(v)];
    else (m as Record<string, unknown>)[k] = v === "" ? undefined : Number(v);
    setParsed({ ...parsed, mapping: m }); setResult(null); setMatches(null);
  }

  async function check() {
    if (!parsed) return;
    setError(null);
    if (!parsed.mapping.species.length) return setError("Choose the column with the species.");
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const rows: UploadRow[] = [];
    const skipped: Partial<Record<SkipReason, number>> = {};
    for (const f of parsed.files) {
      const r = toRows(f.table, parsed.mapping, { utcOffsetHours: Number(opts.utcOffsetHours) || 0, site: opts.site.trim() || undefined, lat: num(opts.lat), lon: num(opts.lon), minConf, method, sourceFile: f.name });
      rows.push(...r.rows);
      for (const [k, n] of Object.entries(r.skipped)) skipped[k as SkipReason] = (skipped[k as SkipReason] ?? 0) + (n ?? 0);
    }
    setResult({ rows, skipped });
    const names = [...new Set(rows.map((r) => r.name))];
    setProgress("Checking names against GBIF...");
    const all: Match[] = [];
    for (let i = 0; i < names.length; i += 200) {
      const r = await post({ action: "names", names: names.slice(i, i + 200) });
      if (!r) return;
      all.push(...r.matches);
    }
    setMatches(all); setProgress(null);
  }

  async function post(body: unknown) {
    const r = await fetch(`/api/v1/datasets/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? "Something went wrong."); setProgress(null); return null; }
    return d;
  }

  async function upload() {
    if (!result) return;
    const ren = Object.fromEntries(Object.entries(rename).filter(([, v]) => v.trim()));
    let added = 0, duplicates = 0, unmatched = 0;
    for (let i = 0; i < result.rows.length; i += CHUNK) {
      setProgress(`Uploading ${Math.min(i + CHUNK, result.rows.length).toLocaleString()} of ${result.rows.length.toLocaleString()}...`);
      const d = await post({ action: "records", rows: result.rows.slice(i, i + CHUNK), rename: ren });
      if (!d) return;
      added += d.added; duplicates += d.duplicates; unmatched += d.unmatched;
    }
    setProgress(`Added ${added.toLocaleString()} records${duplicates ? `, ${duplicates.toLocaleString()} already there` : ""}${unmatched ? `, ${unmatched.toLocaleString()} left out (name not recognised)` : ""}.`);
    setParsed(null); setResult(null); setMatches(null);
    router.refresh();
  }

  const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-2 py-1.5 text-slate-100 placeholder:text-slate-500";
  const unmatched = matches?.filter((m) => !m.scientificName) ?? [];
  const m = parsed?.mapping;
  const needPlace = m && (m.lat === undefined || m.lon === undefined);
  return (
    <div className="mt-3 space-y-4 text-sm">
      <label className="block">
        <span className="text-slate-400">Detection tables (CSV, semicolon or tab separated). BirdNET-Pi, BirdNET-Go, BirdNET-Analyzer and Kaleidoscope are recognised; any table with a date, a species and a place works.</span>
        <input type="file" accept=".csv,.txt,.tsv,text/csv" multiple onChange={(e) => readFiles(e.target.files)} className="mt-2 block w-full text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-slate-100" />
      </label>
      {parsed && m && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
          <p className="text-slate-300">{parsed.files.length} {parsed.files.length === 1 ? "file" : "files"}, {parsed.files.reduce((s, f) => s + f.table.length, 0).toLocaleString()} rows. Format: <b>{parsed.format}</b>. Check the columns:</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {FIELDS.map(([k, l]) => {
              const val = k === "species" ? m.species[0] : (m[k] as number | undefined);
              return (
                <label key={k} className="text-slate-400">{l}
                  <select value={val ?? ""} onChange={(e) => setCol(k, e.target.value)} className={input}>
                    <option value="">(none)</option>
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-slate-400">Times in the file are UTC plus (hours)<input value={opts.utcOffsetHours} onChange={(e) => setOpts({ ...opts, utcOffsetHours: e.target.value })} inputMode="decimal" className={input} /></label>
            {(m.site === undefined || needPlace) && <label className="text-slate-400">Site name<input value={opts.site} onChange={(e) => setOpts({ ...opts, site: e.target.value })} placeholder="Recorder 1" className={input} /></label>}
            {needPlace && <label className="text-slate-400">Latitude<input value={opts.lat} onChange={(e) => setOpts({ ...opts, lat: e.target.value })} inputMode="decimal" placeholder="-8.75" className={input} /></label>}
            {needPlace && <label className="text-slate-400">Longitude<input value={opts.lon} onChange={(e) => setOpts({ ...opts, lon: e.target.value })} inputMode="decimal" placeholder="26.75" className={input} /></label>}
          </div>
          {needPlace && <MapPick lat={opts.lat ? Number(opts.lat) : null} lon={opts.lon ? Number(opts.lon) : null} onPick={(la, lo) => setOpts({ ...opts, lat: String(la), lon: String(lo) })} />}
          {needPlace && <p className="text-xs text-slate-500">No coordinate columns: every row gets this site and position. Upload one recorder at a time.</p>}
          <button onClick={check} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400">Check rows</button>
        </div>
      )}
      {result && matches && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
          <p className="text-slate-200">{result.rows.length.toLocaleString()} rows ready, {new Set(result.rows.map((r) => r.name)).size} names.</p>
          {Object.keys(result.skipped).length > 0 && (
            <p className="text-slate-400">Left out: {Object.entries(result.skipped).map(([k, n]) => `${n!.toLocaleString()} ${k}`).join(", ")}.</p>
          )}
          {unmatched.length > 0 && (
            <div>
              <p className="text-amber-300">{unmatched.length} {unmatched.length === 1 ? "name is" : "names are"} not recognised by GBIF. Type the scientific name to use, or leave blank to leave those rows out:</p>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {unmatched.slice(0, 100).map((u) => (
                  <label key={u.input} className="flex items-center gap-2 text-slate-300"><span className="w-40 shrink-0 truncate" title={u.input}>{u.input}</span>
                    <input value={rename[u.input] ?? ""} onChange={(e) => setRename({ ...rename, [u.input]: e.target.value })} placeholder="Genus species" className={input} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <button onClick={upload} disabled={!!progress} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">Upload {result.rows.length.toLocaleString()} rows</button>
        </div>
      )}
      {progress && <p className="text-cyan-300">{progress}</p>}
      {error && <p className="text-rose-300">{error}</p>}
    </div>
  );
}
