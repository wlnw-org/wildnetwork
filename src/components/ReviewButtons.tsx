"use client";
import { useState } from "react";

const VERDICTS = [
  { v: "correct", label: "Looks right" },
  { v: "misid", label: "Misidentification" },
  { v: "resident", label: "Resident, not an arrival" },
  { v: "unsure", label: "Unsure" },
] as const;
export type Counts = Partial<Record<(typeof VERDICTS)[number]["v"], number>>;

/** Review one arrival estimate (species x cell). Needs ORCID sign-in; shows the running counts. */
export default function ReviewButtons({ species, cellLat, cellLon, counts, signedIn }: { species: string; cellLat: number; cellLon: number; counts: Counts; signedIn: boolean }) {
  const [mine, setMine] = useState<string | null>(null);
  const [c, setC] = useState<Counts>(counts);
  const [err, setErr] = useState<string | null>(null);
  async function vote(v: string) {
    const next = mine === v ? null : v;
    const r = await fetch("/api/v1/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ species, cellLat, cellLon, verdict: next }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error ?? "Could not save.");
    setErr(null);
    setC((old) => {
      const n = { ...old };
      if (mine) n[mine as keyof Counts] = Math.max(0, (n[mine as keyof Counts] ?? 0) - 1);
      if (next) n[next as keyof Counts] = (n[next as keyof Counts] ?? 0) + 1;
      return n;
    });
    setMine(next);
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {VERDICTS.map(({ v, label }) => (
        <button key={v} disabled={!signedIn} onClick={() => vote(v)} title={signedIn ? label : "Sign in with ORCID to review"}
          className={`rounded border px-1.5 py-0.5 text-[11px] ${mine === v ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-white/10 text-slate-400 hover:text-slate-200"} disabled:opacity-50`}>
          {label}{c[v] ? ` ${c[v]}` : ""}
        </button>
      ))}
      {err && <span className="text-[11px] text-rose-300">{err}</span>}
    </div>
  );
}
