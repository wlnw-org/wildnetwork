"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "./Analytics";
import { TR, useBodyT } from "./TR";
import { useLocalNames } from "@/lib/i18n";
import type { Puzzle } from "@/lib/quiz";
import { speciesSlug } from "@/lib/site";
import { areaFor, creditLine, isArea, XC_AREAS, type XcArea } from "@/lib/xenocanto";

// Area names go through tb() below; listed here for the translation scan: tb("Europe") tb("Asia") tb("Africa") tb("The Americas") tb("Australia and Oceania")
const LABEL: Record<XcArea, string> = { europe: "Europe", asia: "Asia", africa: "Africa", america: "The Americas", australia: "Australia and Oceania" };
const ORDER: XcArea[] = ["europe", "asia", "africa", "america", "australia"];
const AREA_KEY = "wn_quiz_area";
const STATS_KEY = "wn_quiz";

/** Kept only in this browser. */
interface Stats { plays: Record<string, { pick: string; ok: boolean }>; played: number; won: number; streak: number; best: number; last: string | null }
const EMPTY: Stats = { plays: {}, played: 0, won: 0, streak: 0, best: 0, last: null };

function readStats(): Stats {
  try { const s = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null"); return s && typeof s === "object" && s.plays ? { ...EMPTY, ...s } : EMPTY; } catch { return EMPTY; }
}
function saveStats(s: Stats) {
  // Keep the last 60 plays, so the stored list stays small.
  const plays = Object.fromEntries(Object.entries(s.plays).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 60));
  try { localStorage.setItem(STATS_KEY, JSON.stringify({ ...s, plays })); } catch { /* private window: play still works */ }
}
const dayBefore = (day: string) => new Date(Date.parse(day + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
/** The streak still counts when the last correct answer was today or yesterday. */
const currentStreak = (s: Stats, day: string) => (s.last === day || s.last === dayBefore(day) ? s.streak : 0);

export default function Quiz() {
  const tb = useBodyT();
  const [area, setArea] = useState<XcArea | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [data, setData] = useState<{ area: XcArea; day: string; puzzle: Puzzle | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Area: the one picked last time, else the visitor's continent (/api/v1/near, whole degrees), else Europe.
  useEffect(() => {
    let off = false;
    Promise.resolve().then(async () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(AREA_KEY); } catch { /* ignore */ }
      let a: XcArea = "europe";
      if (isArea(saved)) a = saved;
      else {
        const near = await fetch("/api/v1/near").then((r) => r.json()).catch(() => ({}));
        if (typeof near.lat === "number" && typeof near.lon === "number") a = areaFor(near.lon, near.lat);
      }
      if (!off) { setStats(readStats()); setArea(a); }
    });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (!area) return;
    let off = false;
    fetch(`/api/v1/quiz?area=${area}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { day: string; puzzle: Puzzle | null }) => { if (!off) { setData({ area, day: d.day, puzzle: d.puzzle }); setFailed(false); } })
      .catch(() => { if (!off) setFailed(true); });
    return () => { off = true; };
  }, [area]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const puzzle = data && data.area === area ? data.puzzle : null;
  const local = useLocalNames(puzzle ? puzzle.options.map((o) => o.scientificName) : []);
  const day = data?.day ?? new Date(now).toISOString().slice(0, 10);
  const played = puzzle ? stats.plays[`${puzzle.day}|${puzzle.area}`] : undefined;
  const answer = puzzle?.options.find((o) => o.scientificName === puzzle.answer);

  function choose(name: string) {
    if (!puzzle || played) return;
    const ok = name === puzzle.answer;
    const s: Stats = { ...stats, plays: { ...stats.plays, [`${puzzle.day}|${puzzle.area}`]: { pick: name, ok } }, played: stats.played + 1, won: stats.won + (ok ? 1 : 0) };
    if (ok && s.last !== puzzle.day) {
      s.streak = s.last === dayBefore(puzzle.day) ? s.streak + 1 : 1;
      s.last = puzzle.day;
      s.best = Math.max(s.best, s.streak);
    }
    setStats(s);
    saveStats(s);
    track("quiz_answer", { area: puzzle.area, correct: ok ? 1 : 0 });
  }

  function pickArea(a: XcArea) {
    setArea(a);
    try { localStorage.setItem(AREA_KEY, a); } catch { /* ignore */ }
  }

  async function share() {
    if (!puzzle || !played) return;
    const streak = currentStreak(stats, day);
    const text = [
      tb("Wildlife Network bird sound #{n}, {area}: {mark}", { n: puzzle.number, area: tb(LABEL[puzzle.area]), mark: played.ok ? "✅" : "❌" }),
      streak > 1 ? tb("{n} days in a row", { n: streak }) : null,
    ].filter(Boolean).join(" ");
    const url = "https://wlnw.org/quiz";
    track("quiz_share", { area: puzzle.area });
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* share sheet closed */ }
  }

  const left = Math.max(0, Date.parse(day + "T00:00:00Z") + 86_400_000 - now);
  const streak = currentStreak(stats, day);

  return (
    <div className="mt-6">
      <div role="tablist" aria-label={tb("Area")} className="flex flex-wrap gap-2">
        {ORDER.filter((a) => XC_AREAS.includes(a)).map((a) => (
          <button key={a} role="tab" aria-selected={a === area} onClick={() => pickArea(a)}
            className={`rounded-full border px-3 py-1 text-sm ${a === area ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-white/15 text-slate-300 hover:border-white/30"}`}>
            {tb(LABEL[a])}{stats.plays[`${day}|${a}`] ? (stats.plays[`${day}|${a}`].ok ? " ✓" : " ·") : ""}
          </button>
        ))}
      </div>

      <section className="mt-5 rounded-xl border border-white/10 bg-white/5 p-5" aria-live="polite">
        {!area || (!data && !failed) ? (
          <p className="text-slate-400"><TR k="Finding today's sound..." /></p>
        ) : failed ? (
          <p><TR k="The quiz could not load just now. Please try again in a minute." /></p>
        ) : !puzzle ? (
          <p><TR k="No sound for this area today. Try another area." /></p>
        ) : (
          <>
            <p className="text-sm uppercase tracking-wider text-slate-400">
              <TR k="Sound #{n}" v={{ n: puzzle.number }} /> · {tb(LABEL[puzzle.area])}
            </p>
            <p className="mt-2 text-lg text-slate-100"><TR k="Listen, then pick the bird you hear." /></p>
            <audio controls preload="none" src={puzzle.clip.file} className="mt-3 w-full" aria-label={tb("Play today's sound")}
              onPlay={() => track("quiz_play", { area: puzzle.area })} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {puzzle.options.map((o) => {
                const isAnswer = o.scientificName === puzzle.answer, isPick = played?.pick === o.scientificName;
                const tone = !played ? "border-white/15 hover:border-cyan-400 hover:bg-cyan-400/10"
                  : isAnswer ? "border-emerald-400 bg-emerald-400/15 text-emerald-100"
                  : isPick ? "border-rose-400 bg-rose-400/15 text-rose-100" : "border-white/10 opacity-60";
                return (
                  <button key={o.scientificName} disabled={!!played} onClick={() => choose(o.scientificName)}
                    className={`rounded-lg border px-4 py-3 text-left transition ${tone}`}>
                    <span className="block font-medium text-slate-100">{local(o.scientificName, o.name)}</span>
                    <span className="block text-xs italic text-slate-400">{o.scientificName}</span>
                  </button>
                );
              })}
            </div>

            {played && answer && (
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-lg text-slate-100">
                  {played.ok ? <TR k="Correct! That was the {name}." v={{ name: local(answer.scientificName, answer.name) }} />
                    : <TR k="Not this time. That was the {name}." v={{ name: local(answer.scientificName, answer.name) }} />}
                </p>
                {puzzle.clip.sonogram && (
                  // Hot-linked from xeno-canto, not copied.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={puzzle.clip.sonogram} alt={tb("Sonogram of the recording")} loading="lazy" className="mt-3 h-16 w-full rounded bg-white object-cover" />
                )}
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  <Link href={`/species/${speciesSlug(answer.scientificName)}`} className="text-cyan-400 hover:underline"><TR k="When and where it is found" /></Link>
                  <Link href={`/?species=${encodeURIComponent(answer.scientificName)}`} className="text-cyan-400 hover:underline"><TR k="See it on the map" /></Link>
                  <button onClick={share} className="text-cyan-400 hover:underline">{copied ? tb("Copied") : tb("Share your result")}</button>
                </p>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400">
              {[puzzle.clip.type, puzzle.clip.seconds != null ? `${puzzle.clip.seconds} s` : null].filter(Boolean).join(", ")} · {creditLine(puzzle.clip)} ·{" "}
              {played ? <a href={puzzle.clip.url} target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline">XC{puzzle.clip.id}</a> : <>XC{puzzle.clip.id}</>} ·{" "}
              <a href={puzzle.clip.license.url} target="_blank" rel="noreferrer license" className="text-cyan-500 hover:underline">{puzzle.clip.license.name}</a>
            </p>
          </>
        )}
      </section>

      <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
        {[
          [tb("Played"), stats.played],
          [tb("Correct"), stats.played ? `${Math.round((100 * stats.won) / stats.played)}%` : "0%"],
          [tb("Days in a row"), streak],
          [tb("Best run"), stats.best],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-3">
            <dd className="text-2xl font-semibold tabular-nums text-slate-100">{v}</dd>
            <dt className="text-xs text-slate-400">{k}</dt>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-sm text-slate-400">
        <TR k="A new sound for every area each day at midnight UTC, in {h} h {m} min." v={{ h: Math.floor(left / 3_600_000), m: Math.floor((left % 3_600_000) / 60_000) }} />{" "}
        <TR k="Your results stay in this browser only." />
      </p>
      <p className="mt-2 text-xs text-slate-500">
        <TR k="Recordings courtesy of [xeno-canto.org](https://xeno-canto.org), streamed from xeno-canto and credited to each recordist." />
      </p>
    </div>
  );
}
