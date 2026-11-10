"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GROUP_LABELS, LICENSE_LABELS } from "@/lib/datasetLabels";

export interface DatasetFormValues {
  title: string; institution: string | null; description: string | null; people: { name: string; orcid?: string }[]; license: string; grp: string;
  method: string; device: string | null; classifier: string | null; min_conf: number; precision_km: number; doi: string | null;
}

/** Describe a dataset (create) or edit its details. The licence and checking rules are fixed once it is live. */
export default function DatasetForm({ id, initial, live }: { id?: string; initial?: DatasetFormValues; live?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const people = (f.people ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const orcid = l.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/)?.[0];
      return { name: l.replace(/,?\s*(https?:\/\/orcid\.org\/)?\d{4}-\d{4}-\d{4}-\d{3}[\dX]/, "").replace(/[,;]\s*$/, "").trim(), orcid };
    });
    setBusy(true); setMsg(null);
    const r = await fetch(id ? `/api/v1/datasets/${id}` : "/api/v1/datasets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...f, people, ...(id ? { action: "update" } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(d.error ?? "Could not save.");
    if (id) { setMsg("Saved."); router.refresh(); } else router.push(`/datasets/${d.id}`);
  }
  const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-400";
  const label = "block text-sm text-slate-400";
  const v = initial;
  return (
    <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className={`${label} sm:col-span-2`}>Title<input name="title" required defaultValue={v?.title} placeholder="Acoustic monitoring, Upemba National Park, 2024" className={input} /></label>
      <label className={label}>Institution<input name="institution" defaultValue={v?.institution ?? ""} placeholder="Optional" className={input} /></label>
      <label className={label}>Existing DOI, if published elsewhere<input name="doi" defaultValue={v?.doi ?? ""} placeholder="10.15468/..." className={input} /></label>
      <label className={`${label} sm:col-span-2`}>People to credit, one per line, with ORCID iD if they have one
        <textarea name="people" rows={3} defaultValue={v?.people.map((p) => (p.orcid ? `${p.name}, ${p.orcid}` : p.name)).join("\n")} placeholder={"Jane Doe, 0000-0002-1825-0097\nField team of the park"} className={input} />
      </label>
      <label className={`${label} sm:col-span-2`}>How the data was collected<textarea name="description" rows={3} defaultValue={v?.description ?? ""} placeholder="Sites, recording schedule, any manual checks" className={input} /></label>
      <label className={label}>Licence
        <select name="license" defaultValue={v?.license ?? "CC-BY-4.0"} disabled={live} className={input}>
          {Object.entries(LICENSE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {live && <input type="hidden" name="license" value={v?.license} />}
      </label>
      <label className={label}>Animals
        <select name="grp" defaultValue={v?.grp ?? "avian"} className={input}>
          {Object.entries(GROUP_LABELS).filter(([k]) => k !== "marine").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className={label}>Identified by
        <select name="method" defaultValue={v?.method ?? "machine"} disabled={live} className={input}>
          <option value="machine">A classifier (BirdNET, Kaleidoscope, ...)</option>
          <option value="human">People (manual IDs)</option>
        </select>
        {live && <input type="hidden" name="method" value={v?.method} />}
      </label>
      <label className={label}>Lowest classifier confidence to keep
        <input name="minConf" type="number" step="0.05" min="0.1" max="1" defaultValue={v?.min_conf ?? 0.8} readOnly={live} className={input} />
      </label>
      <label className={label}>Recorder<input name="device" defaultValue={v?.device ?? ""} placeholder="Song Meter Micro, AudioMoth 1.2" className={input} /></label>
      <label className={label}>Classifier and version<input name="classifier" defaultValue={v?.classifier ?? ""} placeholder="BirdNET-Analyzer 2.4, model V2.4" className={input} /></label>
      <label className={label}>Location shown in downloads
        <select name="precisionKm" defaultValue={v?.precision_km ?? 10} className={input}>
          {[1, 10, 25, 50].map((k) => <option key={k} value={k}>within about {k} km</option>)}
        </select>
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button disabled={busy} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">{busy ? "Saving..." : id ? "Save details" : "Create dataset"}</button>
        {msg && <span className={msg === "Saved." ? "text-sm text-cyan-300" : "text-sm text-rose-300"}>{msg}</span>}
      </div>
    </form>
  );
}
