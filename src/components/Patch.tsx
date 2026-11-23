"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "./Analytics";
import PlacePicker, { type PickedSpot } from "./PlacePicker";
import { TR, useBodyT } from "./TR";
import type { PatchSpecies } from "@/lib/engage";
import { useLang, useLocalNames } from "@/lib/i18n";
import { speciesSlug } from "@/lib/site";

const PLACES_KEY = "wn_patches";
const TICKS_KEY = "wn_patch_ticks";
const MAX_PLACES = 5;
interface PatchData { year: number; cell: { lat: number; lon: number }; species: PatchSpecies[]; hidden: number; latestWeek: string | null; newThisWeek: string[] }

const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

/** Your patch: places the visitor follows (kept in this browser) and this year's species around each, with their own ticks. */
export default function Patch() {
  const tb = useBodyT();
  const lang = useLang();
  const [places, setPlaces] = useState<PickedSpot[]>([]);
  const [sel, setSel] = useState(0);
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [data, setData] = useState<{ key: string; d: PatchData | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [show, setShow] = useState<"all" | "ticked" | "open">("all");

  useEffect(() => {
    let off = false;
    Promise.resolve().then(() => { if (!off) { setPlaces(read<PickedSpot[]>(PLACES_KEY, [])); setTicks(read(TICKS_KEY, {})); } });
    return () => { off = true; };
  }, []);

  const place = places[sel] ?? places[0];
  const key = place ? `${place.lat},${place.lon}` : "";
  useEffect(() => {
    if (!place) return;
    let off = false;
    fetch(`/api/v1/patch?lat=${place.lat}&lon=${place.lon}`).then((r) => (r.ok ? r.json() : null))
      .then((d: PatchData | null) => { if (!off) setData({ key, d }); }).catch(() => { if (!off) setData({ key, d: null }); });
    return () => { off = true; };
  }, [place, key]);

  const d = data?.key === key ? data.d : null;
  const local = useLocalNames(d ? d.species.map((s) => s.sci) : []);
  const tickKey = d ? `${d.cell.lat},${d.cell.lon}|${d.year}` : "";
  const mine = new Set(ticks[tickKey] ?? []);

  function follow(p: PickedSpot) {
    const next = [p, ...places.filter((x) => `${x.lat},${x.lon}` !== `${p.lat},${p.lon}`)].slice(0, MAX_PLACES);
    setPlaces(next); write(PLACES_KEY, next); setSel(0); setAdding(false);
    track("patch_follow", {});
  }
  function unfollow(i: number) {
    const next = places.filter((_, k) => k !== i);
    setPlaces(next); write(PLACES_KEY, next); setSel(0);
  }
  function tick(sci: string) {
    const list = mine.has(sci) ? [...mine].filter((x) => x !== sci) : [...mine, sci];
    const next = { ...ticks, [tickKey]: list };
    setTicks(next); write(TICKS_KEY, next);
    if (!mine.has(sci)) track("patch_tick", {});
  }
  const date = (w: string) => new Date(w + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "short" });

  if (!place || adding) return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-slate-100">{places.length ? tb("Follow another place") : tb("Pick your patch")}</h2>
      <p className="mt-1 mb-3 text-sm text-slate-400"><TR k="Your home, a park you visit or a town you love. You can follow up to 5 places." /></p>
      <PlacePicker onPick={follow} />
      {places.length > 0 && <button className="mt-3 text-sm text-slate-400 underline" onClick={() => setAdding(false)}>{tb("Cancel")}</button>}
    </section>
  );

  const list = d ? d.species.filter((s) => show === "all" || (show === "ticked" ? mine.has(s.sci) : !mine.has(s.sci))) : [];
  const fresh = d ? d.species.filter((s) => d.newThisWeek.includes(s.sci)) : [];
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {places.map((p, i) => (
          <button key={`${p.lat},${p.lon}`} onClick={() => setSel(i)}
            className={`rounded-full border px-3 py-1 text-sm ${i === sel ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-white/15 text-slate-300 hover:border-white/30"}`}>{p.label.split(",")[0]}</button>
        ))}
        {places.length < MAX_PLACES && <button className="rounded-full border border-dashed border-white/20 px-3 py-1 text-sm text-slate-400 hover:text-slate-200" onClick={() => setAdding(true)}>+ {tb("Add a place")}</button>}
      </div>

      <section className="mt-5 rounded-xl border border-white/10 bg-white/5 p-5">
        {!d ? <p className="text-slate-400">{data?.key === key ? tb("Could not load this place just now. Please try again later.") : tb("Loading...")}</p> : (
          <>
            <h2 className="text-xl font-semibold text-slate-100">{place.label}</h2>
            <p className="mt-1 text-sm text-slate-400"><TR k="Species recorded within about 550 km in {year}, from recording stations, observers and research data." v={{ year: d.year }} /></p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3"><div className="text-2xl font-semibold tabular-nums text-slate-100">{d.species.length}</div><div className="text-xs text-slate-400">{tb("Recorded this year")}</div></div>
              <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3"><div className="text-2xl font-semibold tabular-nums text-emerald-200">{[...mine].filter((x) => d.species.some((s) => s.sci === x)).length}</div><div className="text-xs text-slate-400">{tb("You saw or heard")}</div></div>
            </div>
            {fresh.length > 0 && d.latestWeek && (
              <p className="mt-4 text-sm"><strong className="text-amber-200">{tb("New this week:")}</strong>{" "}
                {fresh.slice(0, 12).map((s, i) => <span key={s.sci}>{i ? ", " : ""}<Link href={`/species/${speciesSlug(s.sci)}`} className="text-cyan-400 hover:underline">{local(s.sci, s.name)}</Link></span>)}
              </p>
            )}
            <div role="tablist" className="mt-4 flex gap-2 text-sm">
              {([["all", tb("All")], ["open", tb("Still to find")], ["ticked", tb("Mine")]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={show === k} onClick={() => setShow(k)} className={`rounded-md px-2.5 py-1 ${show === k ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>{l}</button>
              ))}
            </div>
            <ul className="mt-2 divide-y divide-white/5">
              {list.slice(0, 400).map((s) => (
                <li key={s.sci} className="flex items-center gap-3 py-1.5">
                  <input type="checkbox" checked={mine.has(s.sci)} onChange={() => tick(s.sci)} aria-label={tb("I saw or heard the {name}", { name: local(s.sci, s.name) })} className="h-4 w-4 accent-emerald-400" />
                  <Link href={`/species/${speciesSlug(s.sci)}`} className="flex-1 text-slate-200 hover:text-cyan-300">{local(s.sci, s.name)} <i className="text-xs text-slate-500">{s.sci}</i></Link>
                  <span className="text-xs text-slate-500" title={tb("First recorded this year")}>{date(s.first)}</span>
                </li>
              ))}
            </ul>
            {d.species.length === 0 && <p className="mt-3 text-sm text-slate-400"><TR k="Nothing recorded around here yet this year." /></p>}
            {d.hidden > 0 && <p className="mt-3 text-xs text-slate-500"><TR k="{n} sensitive species are not named." v={{ n: d.hidden }} /></p>}
            <p className="mt-4 text-xs text-slate-500"><TR k="Tick the species you saw or heard yourself. Your ticks and places stay in this browser only." /></p>
            <button className="mt-2 text-xs text-slate-500 underline hover:text-slate-300" onClick={() => unfollow(sel)}>{tb("Stop following this place")}</button>
          </>
        )}
      </section>
    </div>
  );
}
