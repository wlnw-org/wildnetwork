"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "./SignIn";
import ResearchSignIn from "./ResearchSignIn";

const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500";

/** Post a project on the board. */
export default function ProjectForm({ needs, studies, hasEmail }: { needs: Record<string, string>; studies: { id: string; title: string }[]; hasEmail: boolean }) {
  const me = useMe();
  const router = useRouter();
  const [state, setState] = useState<{ busy?: boolean; msg?: string }>({});
  if (!me?.user) return <div className="mt-4"><p className="mb-3">Sign in with ORCID to post a project. Your name and iD are shown on it.</p><ResearchSignIn next="/projects/new" /></div>;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ busy: true });
    const r = await fetch("/api/v1/projects", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(fd), needs: fd.getAll("needs") }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setState({ msg: d.error ?? "Something went wrong." });
    router.push(`/projects/${d.id}`);
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <input name="title" required minLength={5} maxLength={140} placeholder="Title" aria-label="Title" className={input} />
      <textarea name="question" required minLength={20} maxLength={3000} rows={6} placeholder="The question, what you have so far, and what you would like to do with others" aria-label="Question" className={input} />
      <fieldset>
        <legend className="mb-1 text-sm text-slate-400">Help you are looking for</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(needs).map(([k, v]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="needs" value={k} /> {v}</label>)}
        </div>
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="species" maxLength={120} placeholder="Species or group (optional)" aria-label="Species or group" className={input} />
        <input name="region" maxLength={120} placeholder="Region (optional)" aria-label="Region" className={input} />
      </div>
      {studies.length > 0 && (
        <select name="studyId" aria-label="Linked study area" className={input}>
          <option value="">No linked study area</option>
          {studies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      )}
      {!hasEmail && <input name="email" type="email" required placeholder="Your email, for requests to join" aria-label="Your email" className={input} />}
      <p className="text-xs text-slate-500">The project is public, with your name and ORCID iD. Your email stays private until you accept someone. <a href="/privacy#research" className="text-cyan-400 hover:underline">Privacy</a></p>
      <button disabled={state.busy} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">{state.busy ? "Posting..." : "Post project"}</button>
      {state.msg && <p className="text-sm text-rose-300">{state.msg}</p>}
    </form>
  );
}
