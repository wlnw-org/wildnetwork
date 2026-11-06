"use client";
import { useState } from "react";

/** Create or revoke the dataset's upload key, for desktop tools and scripts. The key is shown once. */
export default function DatasetKey({ id, hasKey, since }: { id: string; hasKey: boolean; since: string | null }) {
  const [key, setKey] = useState<string | null>(null);
  const [has, setHas] = useState(hasKey);
  const [msg, setMsg] = useState<string | null>(null);
  async function act(action: string) {
    const r = await fetch(`/api/v1/datasets/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error ?? "Could not do that.");
    if (action === "key") { setKey(d.key); setHas(true); } else { setKey(null); setHas(false); }
    setMsg(null);
  }
  const url = `https://wlnw.org/api/v1/datasets/${id}`;
  return (
    <div className="text-sm space-y-2">
      <p className="text-slate-400">
        For desktop tools and scripts: an upload key can add records, run the checks and submit this dataset, nothing else.
        {has && !key && <> A key exists{since ? ` (created ${since.slice(0, 10)})` : ""}. Creating a new one replaces it.</>}
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { if (!has || confirm("Replace the current key? Tools using it will stop working.")) act("key"); }} className="rounded-md border border-white/15 px-3 py-1.5 text-slate-200 hover:bg-white/5">{has ? "Create a new key" : "Create upload key"}</button>
        {has && <button onClick={() => { if (confirm("Revoke the key?")) act("revokeKey"); }} className="px-3 py-1.5 text-rose-300 underline">Revoke</button>}
      </div>
      {key && (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="text-amber-200">Copy this key now: it is not shown again.</p>
          <code className="mt-1 block break-all text-slate-100">{key}</code>
          <p className="mt-2 text-slate-400">Send rows (or WDX events with <code>{'"action": "events"'}</code>), up to 2000 per request, then submit:</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre text-xs text-slate-300">{`curl -X POST ${url} \\
  -H "Authorization: Bearer ${key}" -H "content-type: application/json" \\
  -d '{"action":"records","rows":[{"site":"Pond A","lat":-8.75,"lon":26.75,
       "ts":"2025-06-01T05:12:00Z","name":"Pycnonotus barbatus","confidence":0.92,"count":1,"file":"SMM_20250601_051000.wav"}]}'

curl -X POST ${url} -H "Authorization: Bearer ${key}" -H "content-type: application/json" -d '{"action":"submit"}'`}</pre>
        </div>
      )}
      {msg && <p className="text-rose-300">{msg}</p>}
    </div>
  );
}
