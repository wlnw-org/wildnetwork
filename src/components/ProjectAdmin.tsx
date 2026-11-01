"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Owner tools on a project page: close or reopen, delete. A collaborator can leave. */
export default function ProjectAdmin({ id, owner, open, myOrcid }: { id: string; owner: boolean; open: boolean; myOrcid: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  async function act(body: Record<string, unknown>) {
    const r = await fetch(`/api/v1/projects/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "Could not save."), false;
    return true;
  }
  if (!owner) return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
      You are on this project. <button onClick={async () => { if (confirm("Leave this project?") && await act({ action: "removeMember", orcid: myOrcid })) location.reload(); }} className="underline text-slate-400 hover:text-slate-200">Leave</button>
      {msg && <span className="ml-2 text-rose-300">{msg}</span>}
    </div>
  );
  return (
    <div className="mt-4 flex flex-wrap gap-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
      <button onClick={async () => { if (await act({ action: "open", on: !open })) location.reload(); }} className="underline">{open ? "Close to new people" : "Reopen"}</button>
      <button onClick={async () => { if (confirm("Delete this project for everyone?") && await act({ action: "delete" })) router.push("/projects"); }} className="text-rose-300 underline">Delete project</button>
      {msg && <span className="text-rose-300">{msg}</span>}
    </div>
  );
}
