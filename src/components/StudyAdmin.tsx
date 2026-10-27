"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Owner tools on a study page: collaborators, weekly digest, delete. A collaborator can leave. */
export default function StudyAdmin({ id, owner, digest }: { id: string; owner: boolean; digest: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [on, setOn] = useState(digest);
  async function act(body: Record<string, unknown>, reload = true) {
    const r = await fetch(`/api/v1/studies/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "Could not save."), false;
    if (reload) location.reload();
    return true;
  }
  if (!owner) return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
      You are a collaborator on this study. <button onClick={async () => { if (confirm("Leave this study?")) { const me = await fetch("/api/v1/me").then((r) => r.json()); await act({ action: "removeMember", orcid: me.user?.orcid }); } }} className="underline text-slate-400 hover:text-slate-200">Leave</button>
      {msg && <span className="ml-2 text-rose-300">{msg}</span>}
    </div>
  );
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm space-y-3">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("orcid"); act({ action: "addMember", orcid: v }); }}>
        <span className="text-slate-400">Add a collaborator:</span>
        <input name="orcid" placeholder="ORCID iD, e.g. 0000-0002-1825-0097" aria-label="Collaborator ORCID iD" className="min-w-0 flex-1 rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-slate-100 placeholder:text-slate-500" />
        <button className="rounded-md bg-cyan-500 px-3 py-1 font-medium text-slate-950 hover:bg-cyan-400">Add</button>
      </form>
      <label className="flex items-center gap-2"><input type="checkbox" checked={on} onChange={async (e) => { const v = e.target.checked; if (await act({ action: "digest", on: v }, false)) setOn(v); }} /> Weekly email digest of new arrivals (needs the email given when the study was created)</label>
      <button onClick={() => { if (confirm("Delete this study area for everyone? Reviews are kept.")) act({ action: "delete" }, false).then((ok) => { if (ok) router.push("/studies"); }); }} className="text-rose-300 underline">Delete study</button>
      {msg && <p className="text-rose-300">{msg}</p>}
    </div>
  );
}
