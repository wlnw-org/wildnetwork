"use client";
import { useState } from "react";
import { TR, useBodyT } from "@/components/TR";

const input = "w-full rounded-md border border-white/15 bg-slate-900 px-2 py-1.5 text-slate-200";

/** Sends a possible sighting of a lost species to the private review queue. */
export default function LostReportForm({ species }: { species: string[] }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const tb = useBodyT();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy"); setErr("");
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    const r = await fetch("/api/v1/lost/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) { setState("done"); return; }
    setErr(((r ? await r.json().catch(() => ({})) : {}) as { error?: string }).error ?? tb("Something went wrong. Please try again."));
    setState("idle");
  }
  if (state === "done") return (
    <div className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-5">
      <p className="text-slate-100"><TR k="Thank you. Your report is in our private review queue." /></p>
      <p className="mt-2 text-sm"><TR k="An expert will look at it. Most reports turn out to be a similar species, so please do not be disappointed if that happens. If you gave your email, we will write to you if we need more detail." /></p>
    </div>
  );
  return (
    <form onSubmit={submit} className="mt-6 space-y-4 text-sm">
      <label className="block"><TR k="Species" />
        <input name="species" list="lost-species-names" required placeholder={tb("Start typing a name")} className={`mt-1 ${input}`} />
        <datalist id="lost-species-names">{species.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      <label className="block"><TR k="Date of the sighting" />
        <input name="date" type="date" required className={`mt-1 ${input} max-w-xs`} />
      </label>
      <label className="block"><TR k="Where" />
        <input name="place" placeholder={tb("For example, a village, park or trail")} className={`mt-1 ${input}`} />
      </label>
      <div className="flex gap-3">
        <label className="block flex-1"><TR k="Latitude, if you know it (optional, e.g. from Google Maps)" /><input name="lat" inputMode="decimal" className={`mt-1 ${input}`} /></label>
        <label className="block flex-1"><TR k="Longitude, if you know it (optional)" /><input name="lon" inputMode="decimal" className={`mt-1 ${input}`} /></label>
      </div>
      <label className="block"><TR k="Link to your photo or recording" />
        <input name="link" type="text" inputMode="url" placeholder="https://" className={`mt-1 ${input}`} />
        <span className="mt-1 block text-slate-400"><TR k="For example on iNaturalist, xeno-canto, eBird or a shared folder. Please keep the exact place hidden there if the site lets you." /></span>
      </label>
      <label className="block"><TR k="What did you see or hear?" />
        <textarea name="note" rows={4} className={`mt-1 ${input}`} />
      </label>
      <label className="block"><TR k="Your email (optional)" />
        <input name="email" type="email" className={`mt-1 ${input} max-w-sm`} />
        <span className="mt-1 block text-slate-400"><TR k="Only so we can ask you about it. It is stored encrypted and never shown." /></span>
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {err && <p className="text-rose-400">{err}</p>}
      <button disabled={state === "busy"} className="rounded-md border border-emerald-400 bg-emerald-500/20 px-4 py-2 text-slate-100">{state === "busy" ? <TR k="Sending" /> : <TR k="Send for review" />}</button>
    </form>
  );
}
