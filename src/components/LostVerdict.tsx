"use client";
import { useState } from "react";

type Verdict = "likely_wrong" | "needs_checking" | "worth_investigating";
const OPTIONS: [Verdict, string, string][] = [
  ["likely_wrong", "Likely wrong", "border-slate-500 bg-slate-600/40"],
  ["needs_checking", "Needs checking", "border-amber-400 bg-amber-500/20"],
  ["worth_investigating", "Worth investigating", "border-emerald-400 bg-emerald-500/20"],
];

/** A reviewer's verdict on one held lost species record. Saving never publishes anything. */
export default function LostVerdict({ id, verdict, note, hideArea, rewild }: { id: number; verdict: Verdict | null; note: string | null; hideArea: boolean;
  /** The email Re:wild would get, its address (null = sending off), and when it was sent. */
  rewild: { subject: string; text: string; to: string | null; sentAt: string | null } }) {
  const [v, setV] = useState<Verdict | null>(verdict);
  const [n, setN] = useState(note ?? "");
  const [hide, setHide] = useState(hideArea);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<string | null>(rewild.sentAt);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  async function sendRewild() {
    setSending(true); setSendErr("");
    const r = await fetch(`/api/v1/lost/flags/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rewild" }) }).catch(() => null);
    if (r?.ok) setSent(new Date().toISOString());
    else setSendErr(((r ? await r.json().catch(() => ({})) : {}) as { error?: string }).error ?? "Could not send");
    setSending(false);
  }
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
      {sent ? (
        <p className="text-sm text-emerald-400">Sent to Re:wild on {new Date(sent).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}. You were copied in.</p>
      ) : v === "worth_investigating" && (
        <details className="rounded-md border border-emerald-400/30 bg-emerald-500/5 p-3 text-sm">
          <summary className="cursor-pointer text-emerald-300">Send to Re:wild</summary>
          <p className="mt-2 text-slate-400">Read the email below. It goes to {rewild.to ?? "the Re:wild contact"}, copied to you, and replies come to you. Save your note first if you want it included.</p>
          <p className="mt-2 font-medium text-slate-200">{rewild.subject}</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-300">{rewild.text}</pre>
          {rewild.to ? (
            <button onClick={sendRewild} disabled={sending || state === "saving"} className="mt-3 rounded-md border border-emerald-400 bg-emerald-500/20 px-3 py-1.5 text-slate-100">{sending ? "Sending" : "Send this email"}</button>
          ) : <p className="mt-3 text-amber-300">Sending is off until the Re:wild contact address is set (REWILD_CONTACT on Vercel).</p>}
          {sendErr && <p className="mt-2 text-rose-400">{sendErr}</p>}
        </details>
      )}
    </div>
  );
}
