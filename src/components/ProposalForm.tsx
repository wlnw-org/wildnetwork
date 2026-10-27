"use client";
import { useState } from "react";

/** "Propose a study" on /research. */
export default function ProposalForm() {
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; msg?: string }>({});
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setState({ busy: true });
    const r = await fetch("/api/v1/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    setState({ ok: r.ok, msg: d.message ?? d.error ?? "Something went wrong." });
  }
  if (state.ok) return <p className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-4 text-slate-100">{state.msg}</p>;
  const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500";
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2">
      <input name="name" required placeholder="Your name" aria-label="Your name" className={input} />
      <input name="email" type="email" required placeholder="Email" aria-label="Email" className={input} />
      <input name="affiliation" placeholder="Institution (optional)" aria-label="Institution" className={input} />
      <input name="area" placeholder="Region or species (optional)" aria-label="Region or species" className={input} />
      <textarea name="question" required rows={4} placeholder="The question you want to answer, and what data you would need" aria-label="Question" className={`${input} sm:col-span-2`} />
      <button disabled={state.busy} className="sm:col-span-2 rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">{state.busy ? "Sending..." : "Send proposal"}</button>
      {state.msg && <p className="sm:col-span-2 text-sm text-rose-300">{state.msg}</p>}
      <p className="sm:col-span-2 text-xs text-slate-500">Read by the maintainer only. Your email is stored encrypted and used only to reply. <a href="/privacy#research" className="text-cyan-400 hover:underline">Privacy</a></p>
    </form>
  );
}
