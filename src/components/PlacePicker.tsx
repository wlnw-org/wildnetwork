"use client";

import { useState } from "react";
import { useBodyT } from "./TR";

export interface PickedSpot { label: string; lat: number; lon: number }

/** Search a town (Open-Meteo through /api/v1/places) or use the visitor's approximate area (/api/v1/near, whole degrees). */
export default function PlacePicker({ onPick }: { onPick: (p: PickedSpot) => void }) {
  const tb = useBodyT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; admin1: string | null; country: string | null; lat: number; lon: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    const r = await fetch(`/api/v1/places?q=${encodeURIComponent(q.trim())}`).then((x) => x.json()).catch(() => ({ places: [] }));
    setResults(Array.isArray(r.places) ? r.places.slice(0, 6) : []);
    setBusy(false);
  }
  async function near() {
    setBusy(true);
    const n = await fetch("/api/v1/near").then((x) => x.json()).catch(() => ({}));
    setBusy(false);
    if (typeof n.lat === "number" && typeof n.lon === "number") onPick({ label: n.city || tb("Your area"), lat: n.lat, lon: n.lon });
    else setResults([]);
  }
  const btn = "rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-100 hover:border-cyan-500 disabled:opacity-50";
  return (
    <div>
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tb("Town or city")} aria-label={tb("Town or city")}
          className="min-w-0 flex-1 rounded-md border border-white/15 bg-slate-900 px-3 py-1.5 text-sm text-slate-100" />
        <button className={btn} disabled={busy}>{tb("Search")}</button>
        <button type="button" className={btn} disabled={busy} onClick={near}>{tb("Use my area")}</button>
      </form>
      {results && (results.length === 0
        ? <p className="mt-2 text-sm text-slate-400">{tb("No place found. Try another spelling or a bigger town nearby.")}</p>
        : <ul className="mt-2 space-y-1">{results.map((r) => {
            const label = [r.name, r.admin1, r.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
            return <li key={`${r.lat},${r.lon}`}><button className="text-left text-sm text-cyan-400 hover:underline" onClick={() => { setResults(null); setQ(""); onPick({ label, lat: r.lat, lon: r.lon }); }}>{label}</button></li>;
          })}</ul>)}
    </div>
  );
}
