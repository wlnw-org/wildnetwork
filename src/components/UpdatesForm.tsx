"use client";
import { useState } from "react";
import { useBodyT } from "@/components/TR";
import { track } from "@/components/Analytics";

/** Sign-up for update emails. Confirmation by email first; the address is stored encrypted. */
export default function UpdatesForm() {
  const tb = useBodyT();
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; msg?: string }>({});
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email");
    setState({ busy: true });
    const r = await fetch("/api/v1/updates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "subscribe", email }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) track("updates_subscribe");
    setState({ ok: r.ok, msg: d.message ?? d.error ?? "Something went wrong." });
  }
  if (state.ok) return <p className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-4 text-slate-100">{state.msg}</p>;
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input name="email" type="email" required placeholder={tb("Your email")} aria-label={tb("Your email")}
        className="w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500" />
      <button disabled={state.busy} className="shrink-0 rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">{tb("Email me updates")}</button>
      {state.msg && <p className="text-sm text-rose-300 sm:self-center">{state.msg}</p>}
    </form>
  );
}
