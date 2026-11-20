"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useBodyT } from "@/components/TR";
import { useLang, useLocalNames } from "@/lib/i18n";
import type { FeedRow } from "@/lib/stations";

const speciesHref = (sci: string) => `/species/${sci.toLowerCase().replace(/\s+/g, "-")}`;

/** "5 minutes ago" in the visitor's language. */
const subscribeClock = (cb: () => void) => { const t = setInterval(cb, 30_000); return () => clearInterval(t); };
/** Now, in 30 second steps (a stable snapshot); 0 on the server and during hydration, so times render only in the browser. */
const useNow = () => useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / 30_000) * 30_000, () => 0);

export function useAgo() {
  const lang = useLang();
  const now = useNow();
  return (iso: string) => {
    if (!now) return "";
    const s = Math.max(0, (now - Date.parse(iso)) / 1000);
    const f = new Intl.RelativeTimeFormat(lang === "en" ? "en-GB" : lang, { numeric: "auto" });
    if (s < 60) return f.format(0, "minute");
    if (s < 3600) return f.format(-Math.round(s / 60), "minute");
    if (s < 86400 * 2) return f.format(-Math.round(s / 3600), "hour");
    return f.format(-Math.round(s / 86400), "day");
  };
}

/** "Last heard from 2 hours ago", updated while the page is open. */
export function LastHeard({ iso }: { iso: string | null }) {
  const tb = useBodyT();
  const ago = useAgo();
  if (!iso) return <>{tb("Nothing heard from this station in the time we keep.")}</>;
  return <>{tb("Last heard from {ago}.", { ago: ago(iso) || new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" })}</>;
}

/** Label for a species we do not name at a station's position. */
export function useSensitiveLabel() {
  const tb = useBodyT();
  return (grp: string | null) => {
    switch (grp) {
      case "avian": return tb("A sensitive bird species (not named)");
      case "bat": return tb("A sensitive bat species (not named)");
      case "mammal": return tb("A sensitive mammal species (not named)");
      case "amphibian": return tb("A sensitive frog or toad species (not named)");
      case "insect": return tb("A sensitive insect species (not named)");
      default: return tb("A sensitive species (not named)");
    }
  };
}

/** Species name with a link to its page, in the visitor's language when we have it. */
export function SpeciesName({ sci, common, name }: { sci: string; common: string | null; name: (sci: string, en: string | null) => string }) {
  return (
    <Link href={speciesHref(sci)} className="text-slate-100 hover:text-cyan-300 hover:underline">
      {name(sci, common)}{common || name(sci, common) !== sci ? <span className="ml-1.5 text-xs italic text-slate-500">{sci}</span> : null}
    </Link>
  );
}

/**
 * Newest detections of one station or a group, refreshed every minute from /api/v1/stations/feed (cached for a minute).
 * labels: station names by id, shown per row on group pages.
 */
export default function StationFeed({ ids, initial, labels }: { ids: string[]; initial: FeedRow[]; labels?: Record<string, { name: string; slug: string }> }) {
  const tb = useBodyT();
  const lang = useLang();
  const ago = useAgo();
  const sensitive = useSensitiveLabel();
  const [rows, setRows] = useState(initial);
  const name = useLocalNames(rows.flatMap((r) => (r.sci ? [r.sci] : [])));
  useEffect(() => {
    let off = false;
    const load = () => {
      if (document.hidden) return;
      fetch(`/api/v1/stations/feed?ids=${encodeURIComponent(ids.join(","))}`).then((r) => (r.ok ? r.json() : null))
        .then((j: { rows?: FeedRow[] } | null) => { if (!off && j?.rows) setRows(j.rows); }).catch(() => {});
    };
    const t = setInterval(load, 60_000);
    return () => { off = true; clearInterval(t); };
  }, [ids]);
  const mounted = useNow() > 0;
  // The visitor's own clock, so only after hydration (the server renders in UTC).
  const time = (iso: string) => !mounted ? "" : new Date(iso).toLocaleString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (!rows.length) return <p className="mt-3 text-slate-400">{tb("No detections in the time we keep.")}</p>;
  return (
    <ul className="mt-3 divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.03]">
      {rows.map((r, i) => (
        <li key={`${r.t}-${r.station}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            {r.sci ? <SpeciesName sci={r.sci} common={r.common} name={name} /> : <span className="text-slate-300">{sensitive(r.grp)}</span>}
            {labels?.[r.station] && (
              <Link href={`/stations/${labels[r.station].slug}`} className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-cyan-300">{labels[r.station].name}</Link>
            )}
          </span>
          {r.conf != null && <span className="text-xs text-slate-400">{tb("{n}% sure", { n: Math.round(r.conf * 100) })}</span>}
          <span className="text-xs text-slate-400" title={new Date(r.t).toISOString().replace("T", " ").slice(0, 16) + " UTC"}>{mounted ? `${time(r.t)} · ${ago(r.t)}` : null}</span>
        </li>
      ))}
    </ul>
  );
}

/** Species heard, with counts over the last 24 hours, 7 days and 30 days (or as many days as we keep). */
export function StationSpecies({ rows, keepDays, group = false }: { rows: import("@/lib/stations").SpeciesCount[]; keepDays: number; group?: boolean }) {
  const tb = useBodyT();
  const sensitive = useSensitiveLabel();
  const name = useLocalNames(rows.flatMap((r) => (r.sci ? [r.sci] : [])));
  if (!rows.length) return <p className="mt-3 text-slate-400">{tb("No detections in the time we keep.")}</p>;
  const n = (v: number) => (v ? v.toLocaleString("en-GB") : <span className="text-slate-600">0</span>);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-slate-400">
            <th className="py-1.5 font-medium">{tb("Species")}</th>
            <th className="font-medium text-right">{tb("24 hours")}</th>
            <th className="font-medium text-right">{tb("7 days")}</th>
            <th className="font-medium text-right">{keepDays < 30 ? tb("{n} days", { n: keepDays }) : tb("30 days")}</th>
            {group && <th className="font-medium text-right">{tb("Stations")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.sci ?? `s-${r.grp}-${i}`} className="border-b border-white/5">
              <td className="py-1.5 pr-2">{r.sci ? <SpeciesName sci={r.sci} common={r.common} name={name} /> : <span className="text-slate-300">{sensitive(r.grp)}</span>}</td>
              <td className="text-right">{n(r.day)}</td>
              <td className="text-right">{n(r.week)}</td>
              <td className="text-right">{n(r.month)}</td>
              {group && <td className="text-right">{r.stations}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
