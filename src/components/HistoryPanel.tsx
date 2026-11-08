"use client";
import { fmtNum, useLang, useLocalNames, useT } from "@/lib/i18n";

export type Period = "7d" | "30d" | "12m";
export interface History {
  period: Period; group: string; from: string | null; to: string | null; records: number; species: number; arrivalCount: number;
  cells: { lat: number; lon: number; n: number }[];
  /** [cell lat, cell lon, scientific name, common name, icon group, source, records] */
  points: [number, number, string, string | null, string, string, number][];
  top: { scientific_name: string; vernacular_name: string | null; n: number; cells: number }[];
  arrivals: { scientific_name: string; vernacular_name: string | null; arrival: string; lat: number; lon: number; cells: number }[];
  /** Present when the request named the visitor's area: which area the arrivals list covers. */
  arrivalsScope?: "near" | "region" | "world";
}

/** Panel for a past period (map slider 7d / 30d / 12m): most recorded species and arrivals, from the rollups. */
export default function HistoryPanel({ data, loading, onPick, onBack, scopeLabel }: { data: History | null; loading: boolean; onPick: (name: string) => void; onBack: () => void; scopeLabel?: (sc?: "near" | "region" | "world") => string | null }) {
  const t = useT();
  const lang = useLang();
  const local = useLocalNames(data ? [...data.arrivals.map((a) => a.scientific_name), ...data.top.map((x) => x.scientific_name)] : []);
  const d = (iso: string, year = false) => new Date(iso + "T00:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  const head = (text: string, note?: string, badge?: string | null) => (
    <h3 className="px-4 pt-4 pb-1 text-xs uppercase tracking-wider text-slate-300 flex justify-between gap-2">
      <span>{text}{badge && <span className="ml-1.5 normal-case tracking-normal text-cyan-400">{badge}</span>}</span>
      {note && <span className="normal-case tracking-normal text-slate-400">{note}</span>}
    </h3>
  );
  const row = (name: string, vern: string | null, note: string) => (
    <button key={name} onClick={() => onPick(name)} className="w-full text-left px-4 py-1.5 hover:bg-white/5 flex items-baseline gap-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400">
      <span className="truncate">{local(name, vern)}</span><span className="ml-auto shrink-0 text-xs text-slate-400 tabular-nums">{note}</span>
    </button>
  );
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-3 pb-2 border-b border-white/5 flex items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{data?.period === "12m" ? t("Last 12 months") : data?.period === "30d" ? t("Last 30 days") : t("Last 7 days")}</div>
          {data?.from && data.to && <div className="text-xs text-slate-400">{d(data.from, true)} – {d(data.to, true)}</div>}
        </div>
        <button onClick={onBack} className="ml-auto shrink-0 text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">{t("Back to live")}</button>
      </div>
      {!data || loading ? <div className="px-4 py-3 text-sm text-slate-400">{t("Loading")}</div> : (
        <>
          <div className="px-4 pt-3 text-sm text-slate-200">{t("{r} records of {s} species in {c} areas", { r: fmtNum(data.records, lang, true), s: data.species.toLocaleString(lang), c: data.cells.length.toLocaleString(lang) })}</div>
          <p className="px-4 pt-1 text-xs text-slate-400">{t("Each dot is a species recorded in that area over the period, placed at a station in the area when there is one. Click a dot for its records. Single detections are only kept for the live hours.")}</p>
          {head(t("Arrivals in this period"), data.arrivalCount ? t("{n} species", { n: data.arrivalCount }) : undefined, scopeLabel?.(data.arrivalsScope ?? "world"))}
          {data.arrivals.length ? data.arrivals.map((a) => row(a.scientific_name, a.vernacular_name, d(a.arrival)))
            : <p className="px-4 text-sm text-slate-400">{t("No arrival estimates fall in this period yet (open records arrive one to two weeks late).")}</p>}
          {head(t("Most recorded"), undefined, t("Worldwide"))}
          {data.top.map((x) => row(x.scientific_name, x.vernacular_name, fmtNum(x.n, lang)))}
        </>
      )}
    </div>
  );
}
