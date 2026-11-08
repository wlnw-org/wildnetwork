"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface FlagGroup { scientific_name: string; site: string; flag: string; n: number }

/** Submit, reopen, withdraw; reviewer approve / return; decisions on flagged records. */
export default function DatasetActions({ id, status, records, reviewer, flagged }: { id: string; status: string; records: number; reviewer: boolean; flagged: FlagGroup[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(body: Record<string, unknown>, done?: string) {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/v1/datasets/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(d.error ?? "Could not do that."), null;
    if (body.action === "withdraw") return router.push("/datasets"), d;
    if (done) setMsg(done);
    router.refresh();
    return d;
  }
  const btn = "rounded-md px-3 py-1.5 text-sm disabled:opacity-60";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && records > 0 && <>
          <button disabled={busy} onClick={() => act({ action: "check" }, "Checks updated.")} className={`${btn} border border-white/15 text-slate-200 hover:bg-white/5`}>Run checks</button>
          <button disabled={busy} onClick={async () => { const d = await act({ action: "submit" }); if (d) setMsg(d.status === "live" ? "Live: the records now count on the map and in reports." : "Submitted. A reviewer will look at it, usually within a few days."); }}
            className={`${btn} bg-cyan-500 font-medium text-slate-950 hover:bg-cyan-400`}>{busy ? "Checking..." : "Submit"}</button>
          <button disabled={busy} onClick={() => { if (confirm("Remove every uploaded record from this draft?")) act({ action: "clear" }, "Emptied."); }} className={`${btn} text-slate-400 underline`}>Empty draft</button>
        </>}
        {status === "live" && <button disabled={busy} onClick={() => { if (confirm("Take the dataset out of the map and reports while you add records? It goes live again after you submit.")) act({ action: "reopen" }); }} className={`${btn} border border-white/15 text-slate-200 hover:bg-white/5`}>Add records</button>}
        {status === "review" && reviewer && <>
          <button disabled={busy} onClick={() => act({ action: "approve" }, "Approved.")} className={`${btn} bg-cyan-500 font-medium text-slate-950 hover:bg-cyan-400`}>Approve</button>
          <button disabled={busy} onClick={() => { const note = prompt("What should the contributor fix?"); if (note) act({ action: "return", note }); }} className={`${btn} border border-white/15 text-slate-200 hover:bg-white/5`}>Return with a note</button>
        </>}
        <button disabled={busy} onClick={() => { if (confirm("Withdraw and delete this dataset and all its records? This cannot be undone.")) act({ action: "withdraw" }); }} className={`${btn} text-rose-300 underline`}>Withdraw</button>
        {msg && <span className="text-sm text-cyan-300">{msg}</span>}
      </div>
      {flagged.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-100">Flagged records</h3>
          <p className="text-sm text-slate-400">These stay out of every measure. {reviewer ? "Confirm them after listening to a clip, or reject them." : "Remove any you agree are wrong. To have the others counted, email a short clip of one or two of them; a reviewer can confirm them."}</p>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-slate-400"><tr><th className="py-1">Species</th><th>Site</th><th>Why</th><th className="text-right">Records</th><th /></tr></thead>
            <tbody>
              {flagged.map((f) => (
                <tr key={`${f.scientific_name}|${f.site}|${f.flag}`} className="border-t border-white/5">
                  <td className="py-1 italic">{f.scientific_name}</td><td>{f.site}</td><td className="text-slate-400">{f.flag}</td><td className="text-right">{f.n}</td>
                  <td className="whitespace-nowrap pl-2 text-right">
                    {reviewer && <button disabled={busy} onClick={() => act({ action: "decide", species: f.scientific_name, site: f.site, status: "confirmed" })} className="text-cyan-300 underline">Confirm</button>}{" "}
                    <button disabled={busy} onClick={() => act({ action: "decide", species: f.scientific_name, site: f.site, status: "rejected" })} className="text-rose-300 underline">Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
