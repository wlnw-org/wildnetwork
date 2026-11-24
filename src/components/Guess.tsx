"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "./Analytics";
import PlacePicker, { type PickedSpot } from "./PlacePicker";
import { TR, useBodyT } from "./TR";
import { addDays, score, type Score } from "@/lib/engage";
import { useLang, useLocalNames } from "@/lib/i18n";
import { speciesSlug } from "@/lib/site";

const KEY = "wn_guesses";
const PLACE_KEY = "wn_guess_place";
const SCORED_KEY = "wn_guess_scored";
interface OpenItem { sci: string; name: string | null; week: string; usual: string; usualLow: string | null; usualHigh: string | null }
interface GuessData { cell: { lat: number; lon: number }; today: string; open: OpenItem[]; arrivals: Record<string, string> }
/** One guess, kept in this browser. `previous` is the arrival week we had when the guess was made. */
interface Saved { sci: string; name: string | null; place: string; lat: number; lon: number; date: string; previous: string; made: string }

const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

/** Guess the arrival: predict when a migrant reaches a place; scored when our arrival date for the new season is in. */
export default function Guess() {
  const tb = useBodyT();
  const lang = useLang();
  const [place, setPlace] = useState<PickedSpot | null>(null);
  const [guesses, setGuesses] = useState<Saved[]>([]);
  const [data, setData] = useState<GuessData | null>(null);
  const [scores, setScores] = useState<Record<string, Score | null>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) { setPlace(read<PickedSpot | null>(PLACE_KEY, null)); setGuesses(read<Saved[]>(KEY, [])); } });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (!place) return;
    let off = false;
    fetch(`/api/v1/guess?lat=${place.lat}&lon=${place.lon}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!off) setData(d); }).catch(() => {});
    return () => { off = true; };
  }, [place]);

  // Score saved guesses: one request per place they were made for.
  useEffect(() => {
    if (!guesses.length) return;
    let off = false;
    const spots = [...new Map(guesses.map((g) => [`${g.lat},${g.lon}`, g])).values()];
    Promise.all(spots.map((g) => fetch(`/api/v1/guess?lat=${g.lat}&lon=${g.lon}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((res: (GuessData | null)[]) => {
        if (off) return;
        const out: Record<string, Score | null> = {};
        // Each guess counts once in analytics when it is first scored in this browser.
        const seen = new Set(read<string[]>(SCORED_KEY, []));
        guesses.forEach((g) => {
          const d = res[spots.findIndex((s) => s.lat === g.lat && s.lon === g.lon)];
          const s = score(g.date, g.previous, d?.arrivals[g.sci] ?? null);
          out[`${g.sci}|${g.lat},${g.lon}`] = s;
          const id = `${g.sci}|${g.lat},${g.lon}|${g.made}`;
          if (s && !seen.has(id)) { seen.add(id); track("guess_scored", { verdict: s.verdict, days_off: s.daysOff }); }
        });
        write(SCORED_KEY, [...seen].slice(-100));
        setScores(out);
      });
    return () => { off = true; };
  }, [guesses]);

  const local = useLocalNames([...(data?.open ?? []).map((o) => o.sci), ...guesses.map((g) => g.sci)]);
  const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric" });

  function pick(p: PickedSpot) { setPlace(p); write(PLACE_KEY, p); setChanging(false); setData(null); }
  function save(o: OpenItem) {
    if (!place) return;
    const date = draft[o.sci];
    if (!date) return;
    const g: Saved = { sci: o.sci, name: o.name, place: place.label, lat: place.lat, lon: place.lon, date, previous: o.week, made: new Date().toISOString().slice(0, 10) };
    const next = [g, ...guesses.filter((x) => !(x.sci === g.sci && x.lat === g.lat && x.lon === g.lon))].slice(0, 50);
    setGuesses(next); write(KEY, next);
    track("guess_make", {});
  }
  function remove(g: Saved) {
    const next = guesses.filter((x) => x !== g);
    setGuesses(next); write(KEY, next);
  }
  async function share(g: Saved, s: Score) {
    const text = tb("I guessed when the {name} would arrive in {place} and was {n} days off.", { name: local(g.sci, g.name), place: g.place.split(",")[0], n: s.daysOff });
    try {
      if (navigator.share) await navigator.share({ text, url: "https://wlnw.org/guess" });
      else { await navigator.clipboard.writeText(`${text}\nhttps://wlnw.org/guess`); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    } catch { /* closed */ }
  }
  const verdictText = (s: Score) => s.verdict === "spot-on" ? tb("Spot on!") : s.verdict === "close" ? tb("Close!") : s.verdict === "not-bad" ? tb("Not bad.") : tb("Off this time.");
  const guessed = (sci: string) => place && guesses.find((g) => g.sci === sci && g.lat === place.lat && g.lon === place.lon);

  return (
    <div className="mt-6 space-y-6">
      {guesses.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-slate-100">{tb("Your guesses")}</h2>
          <ul className="mt-2 divide-y divide-white/5">
            {guesses.map((g) => {
              const s = scores[`${g.sci}|${g.lat},${g.lon}`];
              return (
                <li key={`${g.sci}|${g.lat},${g.lon}`} className="py-2 text-sm">
                  <Link href={`/species/${speciesSlug(g.sci)}`} className="font-medium text-slate-100 hover:text-cyan-300">{local(g.sci, g.name)}</Link>
                  <span className="text-slate-400"> · {g.place.split(",")[0]} · {tb("your guess: {date}", { date: fmt(g.date) })}</span>
                  {s ? (
                    <p className="mt-1">
                      <strong className={s.verdict === "off" ? "text-slate-300" : "text-emerald-200"}>{verdictText(s)}</strong>{" "}
                      {tb("It arrived around {date}, {n} days from your guess.", { date: fmt(s.arrived), n: s.daysOff })}{" "}
                      <button className="text-cyan-400 hover:underline" onClick={() => share(g, s)}>{copied ? tb("Copied") : tb("Share")}</button>
                    </p>
                  ) : (
                    <p className="mt-1 text-slate-400">{tb("Waiting for this season's arrival.")} <button className="underline hover:text-slate-200" onClick={() => remove(g)}>{tb("Remove")}</button></p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        {!place || changing ? (
          <>
            <h2 className="text-lg font-semibold text-slate-100">{tb("Where are you watching?")}</h2>
            <div className="mt-3"><PlacePicker onPick={pick} /></div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-lg font-semibold text-slate-100">{tb("Migrants due near {place}", { place: place.label.split(",")[0] })}</h2>
              <button className="text-sm text-cyan-400 hover:underline" onClick={() => setChanging(true)}>{tb("Change place")}</button>
            </div>
            {!data ? <p className="mt-2 text-slate-400">{tb("Loading...")}</p> : data.open.length === 0 ? (
              <p className="mt-2 text-sm"><TR k="We do not have arrival dates for migrants around this place yet, or none are due in the coming months. Arrival dates are best in Europe and North America for now: try a place there, or come back later." /></p>
            ) : (
              <>
                <p className="mt-1 text-sm text-slate-400"><TR k="Each one arrived here last year around the date shown. When do you think it will arrive this time?" /></p>
                <ul className="mt-3 divide-y divide-white/5">
                  {data.open.map((o) => {
                    const g = guessed(o.sci);
                    return (
                      <li key={o.sci} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                        <Link href={`/species/${speciesSlug(o.sci)}`} className="min-w-[10rem] flex-1 font-medium text-slate-100 hover:text-cyan-300">{local(o.sci, o.name)}</Link>
                        <span className="text-slate-400">{tb("Last year: {date}", { date: fmt(addDays(o.week, 3)) })}</span>
                        {g ? <span className="text-emerald-200">{tb("Your guess: {date}", { date: fmt(g.date) })}</span> : (
                          <span className="flex items-center gap-2">
                            <input type="date" min={data.today} max={addDays(o.usual, 120)} value={draft[o.sci] ?? ""} onChange={(e) => setDraft({ ...draft, [o.sci]: e.target.value })}
                              aria-label={tb("Your guess for the {name}", { name: local(o.sci, o.name) })} className="rounded border border-white/15 bg-slate-900 px-2 py-1 text-slate-100" />
                            <button className="rounded-md border border-white/15 px-2.5 py-1 text-slate-100 hover:border-cyan-500 disabled:opacity-40" disabled={!draft[o.sci]} onClick={() => save(o)}>{tb("Guess")}</button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </section>
      <p className="text-xs text-slate-500"><TR k="Arrival dates come from our [arrival measure](/methods), by week, so a guess within 7 days of the middle of that week counts as spot on. Your guesses stay in this browser only." /></p>
    </div>
  );
}
