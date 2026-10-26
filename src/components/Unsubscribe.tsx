"use client";
import { useState } from "react";

export default function Unsubscribe({ token }: { token: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    const r = await fetch("/api/v1/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", token }) });
    const d = await r.json().catch(() => ({}));
    setMsg(d.message ?? d.error ?? "Something went wrong.");
  }
  return msg
    ? <p className="mt-5 text-slate-100">{msg}</p>
    : <button onClick={go} className="mt-5 rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Unsubscribe</button>;
}
