"use client";
import { useState } from "react";

type Target = { project: string } | { study: string };
const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500";
const post = async (body: Record<string, unknown>) => {
  const r = await fetch("/api/v1/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, msg: (d.message ?? d.error ?? "Something went wrong.") as string };
};

/** "Ask to join" for a signed-in researcher who is not on this project or study yet. */
export function AskToJoin({ target, request, hasEmail }: { target: Target; request: { id: string; status: string } | null; hasEmail: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; msg?: string }>({});
  if (request?.status === "accepted") return null;
  if (request?.status === "declined") return <p className="mt-4 text-sm text-slate-400">The owner declined your request to join.</p>;
  if (state.ok) return <p className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-sm text-slate-100">{state.msg}</p>;
  if (request) return (
    <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
      Your request to join is waiting for the owner.{" "}
      <button onClick={async () => { await post({ action: "withdraw", id: request.id }); location.reload(); }} className="underline text-slate-400 hover:text-slate-200">Withdraw it</button>
    </p>
  );
  if (!open) return <button onClick={() => setOpen(true)} className="mt-4 rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Ask to join</button>;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setState({ busy: true });
    setState(await post({ action: "ask", ...target, ...f }));
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <textarea name="message" required minLength={10} maxLength={1000} rows={3} placeholder="What would you bring? Only the owner sees this." aria-label="Message to the owner" className={input} />
      {!hasEmail && <input name="email" type="email" required placeholder="Your email" aria-label="Your email" className={input} />}
      <p className="text-xs text-slate-500">If the owner accepts, you each receive the other&apos;s email address. It is not shown to anyone else. <a href="/privacy#research" className="text-cyan-400 hover:underline">Privacy</a></p>
      <button disabled={state.busy} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">{state.busy ? "Sending..." : "Send request"}</button>
      {state.msg && <p className="text-sm text-rose-300">{state.msg}</p>}
    </form>
  );
}

/** Pending requests, shown to the owner of a project or study. */
export function JoinRequests({ requests, hasEmail }: { requests: { id: string; orcid: string; name: string; message: string | null; created: string }[]; hasEmail: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  if (!requests.length) return null;
  async function decide(id: string, action: "accept" | "decline") {
    const r = await post({ action, id, ...(email ? { email } : {}) });
    if (!r.ok) return setMsg(r.msg);
    alert(r.msg);
    location.reload();
  }
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-sm">
      <p className="font-medium text-slate-100">Asking to join</p>
      {!hasEmail && <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email, sent to anyone you accept" aria-label="Your email" className={input} />}
      {requests.map((q) => (
        <div key={q.id} className="border-t border-white/10 pt-2">
          <a href={`https://orcid.org/${q.orcid}`} className="text-cyan-400 hover:underline">{q.name}</a> <span className="text-slate-500">{q.created}</span>
          {q.message && <p className="mt-1 whitespace-pre-line">{q.message}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={() => decide(q.id, "accept")} className="rounded-md bg-cyan-500 px-3 py-1 font-medium text-slate-950 hover:bg-cyan-400">Accept and share emails</button>
            <button onClick={() => decide(q.id, "decline")} className="rounded-md border border-white/15 px-3 py-1 hover:bg-white/5">Decline</button>
          </div>
        </div>
      ))}
      {msg && <p className="text-rose-300">{msg}</p>}
    </div>
  );
}
