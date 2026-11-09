"use client";
import { useState } from "react";

type Verdict = "likely_wrong" | "needs_checking" | "worth_investigating";
const OPTIONS: [Verdict, string, string][] = [
  ["likely_wrong", "Likely wrong", "border-slate-500 bg-slate-600/40"],
  ["needs_checking", "Needs checking", "border-amber-400 bg-amber-500/20"],
  ["worth_investigating", "Worth investigating", "border-emerald-400 bg-emerald-500/20"],
];

/** A reviewer's verdict on one held lost species record. Saving never publishes anything. */
export default function LostVerdict({ id, verdict, note, hideArea }: { id: number; verdict: Verdict | null; note: string | null; hideArea: boolean }) {
  const [v, setV] = useState<Verdict | null>(verdict);
  const [n, setN] = useState(note ?? "");
  const [hide, setHide] = useState(hideArea);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");
  async function save(next: Verdict | null = v, nextHide = hide) {
    setState("saving");
    const r = await fetch(`/api/v1/lost/flags/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verdict: next, note: n, hideArea: nextHide }) }).catch(() => null);
    if (r?.ok) { setState("saved"); return; }
    const j = r ? await r.json().catch(() => ({})) : {};
    setErr((j as { error?: string }).error ?? "Could not save"); setState("error");
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(([k, label, on]) => (
          <button key={k} onClick={() => { setV(k); save(k); }} disabled={state === "saving"}
            className={`rounded-md border px-3 py-1.5 text-sm ${v === k ? `${on} text-slate-100` : "border-white/15 text-slate-300 hover:border-white/40"}`}>{label}</button>
        ))}
      </div>
      <textarea value={n} onChange={(e) => { setN(e.target.value); setState("idle"); }} rows={2} placeholder="Note for other reviewers (optional)"
        className="w-full rounded-md border border-white/10 bg-slate-900 p-2 text-sm text-slate-200" />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={hide} onChange={(e) => { setHide(e.target.checked); save(v, e.target.checked); }} /> Hide even the broad area if this is ever shown</label>
        <button onClick={() => save()} disabled={state === "saving"} className="rounded-md border border-white/15 px-3 py-1 hover:border-white/40">Save note</button>
        {state === "saved" && <span className="text-emerald-400">Saved</span>}
        {state === "error" && <span className="text-rose-400">{err}</span>}
      </div>
    </div>
  );
}
