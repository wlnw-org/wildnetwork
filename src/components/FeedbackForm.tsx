"use client";
import { useState } from "react";

const KINDS = [["problem", "Something is wrong"], ["idea", "An idea or request"], ["data", "A wrong record or species"], ["other", "Something else"]] as const;
const PRODUCTS = [["website", "This website or the map"], ["studio", "Wildlife Network Studio (desktop app)"], ["birdecho", "BirdEcho (Android app)"], ["agent", "A station or the wdx-agent"], ["other", "Other"]] as const;

/** /feedback form. `product` and `context` come from the link (Studio opens /feedback?from=studio&v=0.1.4&os=macos). */
export default function FeedbackForm({ product, context }: { product: string; context: string }) {
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; msg?: string }>({});
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setState({ busy: true });
    const r = await fetch("/api/v1/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, context }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setState({ ok: !!r?.ok, msg: d.message ?? d.error ?? "Could not send. Please check your connection and try again." });
  }
  if (state.ok) return <p role="status" className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-4 text-slate-100">{state.msg}</p>;
  const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500";
  return (
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <fieldset>
        <legend className="text-sm font-medium text-slate-200">What is it about?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {KINDS.map(([v, l], i) => (
            <label key={v} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm has-[:checked]:border-cyan-400/60">
              <input type="radio" name="kind" value={v} defaultChecked={i === 0} className="accent-cyan-400" /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 text-sm font-medium text-slate-200">
        Which part of Wildlife Network?
        <select name="product" defaultValue={product} className={input}>
          {PRODUCTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-200">
        Your message
        <textarea name="message" required minLength={10} rows={6} className={input}
          placeholder="What happened, or what you would like. For a problem: what you did, what you expected and what you saw. For a wrong record: the species, place and date." />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-200">
        Email (optional, only if you would like a reply)
        <input name="email" type="email" autoComplete="email" className={input} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {context && <p className="text-xs text-slate-400">Sent with your message: {context}</p>}
      <button disabled={state.busy} className="justify-self-start rounded-md bg-cyan-500 px-5 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">{state.busy ? "Sending..." : "Send"}</button>
      {state.msg && <p role="alert" className="text-sm text-rose-300">{state.msg}</p>}
      <p className="text-xs text-slate-400">Read only by the maintainer. An email address is stored encrypted and used only to reply. <a href="/privacy#feedback" className="text-cyan-400 hover:underline">Privacy</a></p>
    </form>
  );
}
