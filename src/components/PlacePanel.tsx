"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { PlaceReport } from "@/lib/places";

export interface PickedPlace { label: string; lat: number; lon: number; slug?: string }

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** Map panel for a searched place: what arrived, what is expected and what is most recorded in its 5 degree cell. */
export default function PlacePanel({ place, group, onPick, onClose }: { place: PickedPlace; group: string; onPick: (name: string) => void; onClose: () => void }) {
  const t = useT();
  const grp = ["avian", "bat", "amphibian", "insect"].includes(group) ? group : "avian";
  const key = `${place.lat},${place.lon},${grp}`;
  const [data, setData] = useState<{ key: string; r: PlaceReport | null } | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/v1/places/report?lat=${place.lat}&lon=${place.lon}&group=${grp}`).then((r) => (r.ok ? r.json() : null))
      .then((r: PlaceReport | null) => { if (!off) setData({ key, r }); }).catch(() => { if (!off) setData({ key, r: null }); });
    return () => { off = true; };
  }, [place.lat, place.lon, grp, key]);
  const r = data?.key === key ? data.r : undefined;

  const row = (name: string, vern: string | null, note: string) => (
    <button key={name} onClick={() => onPick(name)} className="w-full text-left px-4 py-1.5 hover:bg-white/5 flex items-baseline gap-2 text-sm">
      <span className="truncate">{vern ?? name}</span><span className="ml-auto shrink-0 text-xs text-slate-500 tabular-nums">{note}</span>
    </button>
  );
  const head = (children: string) => <h3 className="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-slate-500">{children}</h3>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-3 pb-2 border-b border-white/5 flex items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{t(place.label)}</div>
          {r && <div className="text-[11px] text-slate-500">{t("Area {a}: every measure is per 5 degree square, about 550 km across", { a: `${r.cell.lat}°, ${r.cell.lon}°` })}</div>}
        </div>
        <button onClick={onClose} aria-label={t("Close")} className="ml-auto shrink-0 w-7 h-7 rounded hover:bg-white/10 text-slate-400">×</button>
      </div>
      {r === undefined ? <div className="px-4 py-3 text-sm text-slate-500">{t("Loading")}</div>
        : r === null ? <div className="px-4 py-3 text-sm text-slate-500">{t("Could not load this area.")}</div>
        : (
          <>
            {head(t("Arrived in the last four weeks"))}
            {r.recent.length ? r.recent.slice(0, 8).map((a) => row(a.scientific_name, a.vernacular_name, fmt(a.arrival)))
              : <p className="px-4 text-sm text-slate-500">{t("None in these weeks last year.")}</p>}
            {head(t("Expected in the next six weeks"))}
            {r.coming.length ? r.coming.slice(0, 8).map((a) => row(a.scientific_name, a.vernacular_name, fmt(a.arrival)))
              : <p className="px-4 text-sm text-slate-500">{t("None expected, going by last year.")}</p>}
            {head(t("Most recorded, last eight weeks"))}
            {r.top.length ? r.top.slice(0, 10).map((x) => row(x.scientific_name, x.vernacular_name, t("{n} per 1,000", { n: x.share.toFixed(1) })))
              : <p className="px-4 text-sm text-slate-500">{t("No records here in the last eight weeks.")}</p>}
            <p className="px-4 pt-4 text-xs text-slate-500">
              {t("Watched in {w} of the last 12 weeks.", { w: r.watched })}{" "}
              {r.stations.length ? t("{n} active stations.", { n: r.stations.reduce((s, x) => s + x.n, 0) }) : t("No active stations here yet.")}
            </p>
            {place.slug && (
              <a href={`/places/${place.slug}${grp === "avian" ? "" : `?group=${grp}`}`} className="block mx-4 my-4 rounded-md bg-cyan-500 px-3 py-2 text-center text-sm font-medium text-slate-950 hover:bg-cyan-400">
                {t("Full report for {p}", { p: place.label.split(",")[0] })}
              </a>
            )}
          </>
        )}
    </div>
  );
}
