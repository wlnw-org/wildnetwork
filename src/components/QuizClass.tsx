"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "./Analytics";
import { TR, useBodyT } from "./TR";
import { useLang, useLocalNames } from "@/lib/i18n";
import type { Puzzle } from "@/lib/quiz";
import { creditLine, type XcArea } from "@/lib/xenocanto";

// Area names go through tb() below; listed for the translation scan: tb("Europe") tb("Asia") tb("Africa") tb("The Americas") tb("Australia and Oceania")
// Server messages shown through tb(): tb("Too many classes from this address today. Please try again tomorrow.") tb("Could not make a class code. Please try again.") tb("Could not reach Wildlife Network. Please try again.")
const LABEL: Record<XcArea, string> = { europe: "Europe", asia: "Asia", africa: "Africa", america: "The Americas", australia: "Australia and Oceania" };
const ORDER: XcArea[] = ["europe", "asia", "africa", "america", "australia"];
const btn = "rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-100 hover:border-cyan-500 disabled:opacity-50";

/** Teacher: make a class link for one area. */
export function MakeClass() {
  const tb = useBodyT();
  const router = useRouter();
  const [area, setArea] = useState<XcArea>("europe");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function make() {
    setBusy(true); setError(null);
    const r = await fetch("/api/v1/quiz/class", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ area }) })
      .then((x) => x.json()).catch(() => ({ error: "Could not reach Wildlife Network. Please try again." }));
    setBusy(false);
    if (r.code) { track("quiz_class_create", { area }); router.push(`/quiz/class/${r.code}`); }
    else setError(tb(r.error ?? "Could not make a class code. Please try again."));
  }
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-slate-100">{tb("Which part of the world?")}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {ORDER.map((a) => (
          <button key={a} onClick={() => setArea(a)} aria-pressed={a === area}
            className={`rounded-full border px-3 py-1 text-sm ${a === area ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-white/15 text-slate-300 hover:border-white/30"}`}>{tb(LABEL[a])}</button>
        ))}
      </div>
      <button className={`${btn} mt-4 bg-cyan-500 font-medium text-slate-950 hover:bg-cyan-400`} disabled={busy} onClick={make}>{tb("Make a class link")}</button>
      {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
    </section>
  );
}

interface Result { day: string; answered: number; right: number; picks: Record<string, number>; answer: string | null; names: Record<string, string> }
interface ClassData { code: string; area: XcArea; day: string; puzzle: Puzzle | null; results: Result[] }

/** Teacher view of one class: today's sound to play to the room, answers coming in, and a reveal. */
export function ClassView({ code }: { code: string }) {
  const tb = useBodyT();
  const lang = useLang();
  const [data, setData] = useState<ClassData | null>(null);
  const [missing, setMissing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let off = false;
    const load = () => fetch(`/api/v1/quiz/class/${code}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ClassData) => { if (!off) setData(d); }).catch((s) => { if (!off && s === 404) setMissing(true); });
    load();
    const t = setInterval(load, 8000);
    return () => { off = true; clearInterval(t); };
  }, [code]);

  const p = data?.puzzle ?? null;
  const local = useLocalNames(p ? p.options.map((o) => o.scientificName) : []);
  if (missing) return <p className="mt-6"><TR k="This class link has expired or is not right. [Make a new one](/quiz/class)." /></p>;
  if (!data) return <p className="mt-6 text-slate-400">{tb("Loading...")}</p>;

  const link = `https://wlnw.org/quiz?class=${data.code}`;
  const today = data.results.find((r) => r.day === data.day) ?? { day: data.day, answered: 0, right: 0, picks: {}, answer: null, names: {} };
  const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : lang, { weekday: "short", day: "numeric", month: "short" });
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  }
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-slate-400">{tb("Pupils open this link, or go to wlnw.org/quiz and add the class code:")}</p>
        <p className="mt-2 font-mono text-4xl font-semibold tracking-[0.2em] text-cyan-200">{data.code}</p>
        <p className="mt-2 break-all text-slate-200">{link} <button className="ml-2 text-sm text-cyan-400 hover:underline" onClick={copy}>{copied ? tb("Copied") : tb("Copy link")}</button></p>
        <p className="mt-1 text-sm text-slate-400">{tb("Area: {area}. A new sound comes every day at midnight UTC; the same link works every day.", { area: tb(LABEL[data.area]) })}</p>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5" aria-live="polite">
        <h2 className="text-lg font-semibold text-slate-100">{tb("Today's sound")}</h2>
        {!p ? <p className="mt-2 text-slate-400">{tb("No sound for this area today. Try another area.")}</p> : (
          <>
            <p className="mt-1 text-sm text-slate-400">{tb("Play it to the room, as often as you like.")}</p>
            <audio controls preload="none" src={p.clip.file} className="mt-3 w-full" aria-label={tb("Play today's sound")} />
            <p className="mt-2 text-xs text-slate-400">{creditLine(p.clip)} · XC{p.clip.id} · <a href={p.clip.license.url} target="_blank" rel="noreferrer license" className="text-cyan-500 hover:underline">{p.clip.license.name}</a></p>
            <p className="mt-4 text-3xl font-semibold tabular-nums text-slate-100">{today.answered} <span className="text-base font-normal text-slate-400">{tb("answers so far")}</span></p>
            <ul className="mt-3 space-y-2">
              {p.options.map((o) => {
                const n = today.picks[o.scientificName] ?? 0, isAns = o.scientificName === p.answer;
                const pct = today.answered ? Math.round((100 * n) / today.answered) : 0;
                return (
                  <li key={o.scientificName} className={`rounded-lg border p-3 ${reveal && isAns ? "border-emerald-400 bg-emerald-400/10" : "border-white/10"}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-slate-100">{local(o.scientificName, o.name)} <i className="text-xs font-normal text-slate-400">{o.scientificName}</i></span>
                      {reveal && <span className="tabular-nums text-slate-300">{n} ({pct}%)</span>}
                    </div>
                    {reveal && <div className="mt-2 h-2 rounded bg-white/10"><div className={`h-2 rounded ${isAns ? "bg-emerald-400" : "bg-slate-400"}`} style={{ width: `${pct}%` }} /></div>}
                  </li>
                );
              })}
            </ul>
            <button className={`${btn} mt-4`} onClick={() => { setReveal(!reveal); if (!reveal) track("quiz_class_reveal", { area: data.area }); }}>
              {reveal ? tb("Hide the results") : tb("Show the results and the answer")}
            </button>
            {reveal && today.answered > 0 && <p className="mt-3 text-slate-200">{tb("{right} of {n} got it right.", { right: today.right, n: today.answered })}</p>}
          </>
        )}
      </section>

      {data.results.some((r) => r.day !== data.day) && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-slate-100">{tb("Earlier days")}</h2>
          <ul className="mt-2 divide-y divide-white/5 text-sm">
            {data.results.filter((r) => r.day !== data.day).map((r) => (
              <li key={r.day} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="text-slate-300">{fmt(r.day)}{r.answer ? <> · {r.names[r.answer] ?? r.answer}</> : null}</span>
                <span className="tabular-nums text-slate-400">{tb("{right} of {n} right", { right: r.right, n: r.answered })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-slate-400"><TR k="Only anonymous counts are kept for a class: how many chose each name each day. No names, no accounts. Pupils' own scores stay in their own browsers. Class links stop working after 6 months. [Play on your own](/quiz)." /></p>
    </div>
  );
}

/** A box on /quiz/class to type a code a pupil was given. */
export function JoinBox() {
  const tb = useBodyT();
  const router = useRouter();
  const [v, setV] = useState("");
  return (
    <form className="mt-6 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) router.push(`/quiz?class=${encodeURIComponent(v.trim().toUpperCase())}`); }}>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={tb("Class code")} aria-label={tb("Class code")} maxLength={8}
        className="w-40 rounded-md border border-white/15 bg-slate-900 px-3 py-1.5 font-mono uppercase tracking-widest text-slate-100" />
      <button className={btn}>{tb("Join the class")}</button>
      <Link href="/quiz" className="self-center text-sm text-cyan-400 hover:underline">{tb("Play on your own")}</Link>
    </form>
  );
}
