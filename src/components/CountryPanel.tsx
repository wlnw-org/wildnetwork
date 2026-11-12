"use client";
import { useEffect, useState } from "react";
import { useLang, useLocalNames, useT } from "@/lib/i18n";

type Visitor = { scientificName: string; vernacularName: string | null; arrive: number | null; leave: number | null };
type Data = { name: string; inName: string; records: number; years: [number, number]; visitors: number; page: string | null;
  arriving: Visitor[]; here: Visitor[]; top: { scientificName: string; vernacularName: string | null; months: string }[] };

/** Map panel for a searched country: seasonal visitors arriving now or here now, and the most recorded birds (/api/v1/countries). */
export default function CountryPanel({ slug, onPick, onClose }: { slug: string; onPick: (name: string) => void; onClose: () => void }) {
  const t = useT();
  const [data, setData] = useState<{ slug: string; d: Data | null } | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/v1/countries/${slug}`).then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => { if (!off) setData({ slug, d }); }).catch(() => { if (!off) setData({ slug, d: null }); });
    return () => { off = true; };
  }, [slug]);
  const d = data?.slug === slug ? data.d : undefined;
  const local = useLocalNames(d ? [...d.arriving, ...d.here, ...d.top].map((x) => x.scientificName) : []);
  const lang = useLang();
  const mon = (m: number) => new Date(Date.UTC(2025, m - 1, 15)).toLocaleDateString(lang === "en" ? "en-GB" : lang, { month: "short", timeZone: "UTC" });
  const months = (v: Visitor) => (v.arrive && v.leave ? `${mon(v.arrive)}–${mon(v.leave)}` : "");
  const row = (name: string, vern: string | null, note: string) => (
    <button key={name} onClick={() => onPick(name)} className="w-full text-left px-4 py-1.5 hover:bg-white/5 flex items-baseline gap-2 text-sm">
      <span className="truncate">{local(name, vern)}</span><span className="ml-auto shrink-0 text-xs text-slate-400 tabular-nums">{note}</span>
    </button>
  );
  const head = (s: string) => <h3 className="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-slate-400">{s}</h3>;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-3 pb-2 border-b border-white/5 flex items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{d?.name ?? ""}</div>
          {d && <div className="text-xs text-slate-400">{t("From {records} open bird records, {from} to {to}.", { records: d.records.toLocaleString(), from: d.years[0], to: d.years[1] })}</div>}
        </div>
        <button onClick={onClose} aria-label={t("Close")} className="ml-auto shrink-0 w-7 h-7 rounded hover:bg-white/10 text-slate-400">×</button>
      </div>
      {d === undefined ? <div className="px-4 py-3 text-sm text-slate-400">{t("Loading")}</div>
        : d === null ? <div className="px-4 py-3 text-sm text-slate-400">{t("Could not load this area.")}</div>
        : (
          <>
            {d.page && (
              <a href={d.page} className="mx-4 mt-3 block rounded-md bg-cyan-500 px-3 py-2 text-center text-sm font-medium text-slate-950 hover:bg-cyan-400">
                {t("All migratory birds and their months")}
              </a>
            )}
            {head(t("Visitors arriving around now"))}
            {d.arriving.length ? d.arriving.map((v) => row(v.scientificName, v.vernacularName, months(v)))
              : <p className="px-4 text-sm text-slate-400">{t("None due this month or next.")}</p>}
            {d.here.length > 0 && <>{head(t("Visitors here now"))}{d.here.map((v) => row(v.scientificName, v.vernacularName, months(v)))}</>}
            {head(t("Most recorded birds"))}
            {d.top.map((x) => row(x.scientificName, x.vernacularName, ""))}
            <p className="px-4 py-4 text-xs text-slate-400">{t("Source: GBIF.org, bird records under CC0 and CC BY 4.0, mostly from the eBird Observation Dataset (Cornell Lab of Ornithology).")}</p>
          </>
        )}
    </div>
  );
}
