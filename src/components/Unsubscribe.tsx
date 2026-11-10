"use client";
import { useState } from "react";

export default function Unsubscribe({ token, endpoint = "/api/v1/alerts" }: { token: string; endpoint?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", token }) });
    const d = await r.json().catch(() => ({}));
    setMsg(d.message ?? d.error ?? "Something went wrong.");
  }
  if (!token) return (
    <p className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4">
      This page needs the link from your email. Open the unsubscribe link at the bottom of any of our emails, or write to{" "}
      <a href="mailto:arunrajiah@gmail.com" className="text-cyan-400 hover:underline">arunrajiah@gmail.com</a> and we will remove you.
    </p>
  );
  return msg
    ? <p className="mt-5 text-slate-100">{msg}</p>
    : <button onClick={go} className="mt-5 rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Unsubscribe</button>;
}
