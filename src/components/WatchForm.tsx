"use client";

import { useState } from "react";
import { track } from "./Analytics";
import { TR, useBodyT } from "./TR";

/** Sign-up for the weekly migration watch email for a place (POST /api/v1/alerts action "watch"; confirmed by email). */
export default function WatchForm() {
  const tb = useBodyT();
  const [email, setEmail] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/v1/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "watch", email, place }) })
      .then((x) => x.json()).catch(() => ({ error: "Could not reach Wildlife Network. Please try again." }));
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: tb("Almost done: check your inbox and confirm.") }); track("watch_subscribe", {}); }
    else setMsg({ ok: false, text: r.error ?? "Something went wrong." });
  }
  const input = "min-w-0 flex-1 rounded-md border border-white/15 bg-slate-900 px-3 py-1.5 text-sm text-slate-100";
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-slate-100"><TR k="Migration watch by email" /></h2>
      <p className="mt-1 text-sm text-slate-400"><TR k="One email in weeks with news: which migrants arrived lately around your place and which are due in the next three weeks. Free, and every email has a link to stop it." /></p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tb("Your email")} aria-label={tb("Your email")} className={input} />
        <input required value={place} onChange={(e) => setPlace(e.target.value)} placeholder={tb("Town or city")} aria-label={tb("Town or city")} className={input} />
        <button disabled={busy} className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{tb("Start my migration watch")}</button>
      </form>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-amber-300"}`}>{msg.text}</p>}
      <p className="mt-2 text-xs text-slate-500"><TR k="Your email is stored encrypted and used for nothing else. See the [privacy page](/privacy#alerts)." /></p>
    </section>
  );
}
