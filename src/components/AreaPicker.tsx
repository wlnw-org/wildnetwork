"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useT } from "@/lib/i18n";
import { areaLabel } from "@/lib/areaLabel";

type Hit = { name: string; type: string; osm: string; lat: number; lon: number; km?: number };
const PROTECTED = /national_park|protected_area|nature_reserve|wildlife|sanctuary|conservation|National park|Nature reserve|Wildlife sanctuary|Protected area/;
// Results cached before labels were mapped on the server still carry raw OSM tags such as "boundary national_park".
const label = (type: string) => (/[a-z]_[a-z]|^[a-z]+ [a-z]/.test(type) ? areaLabel(type) : type);
type Mode = "search" | "upload" | "draw";

/** KML in the browser: every Polygon's outer and inner rings, as one MultiPolygon. */
function kmlToGeoJson(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const ring = (el: Element | null) => (el?.textContent ?? "").trim().split(/\s+/).map((c) => c.split(",").map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map((p) => [p[0], p[1]]);
  const polys = [...doc.getElementsByTagNameNS("*", "Polygon")].map((p) => {
    const outer = ring(p.getElementsByTagNameNS("*", "outerBoundaryIs")[0]?.getElementsByTagNameNS("*", "coordinates")[0] ?? null);
    const inner = [...p.getElementsByTagNameNS("*", "innerBoundaryIs")].map((i) => ring(i.getElementsByTagNameNS("*", "coordinates")[0] ?? null));
    return [outer, ...inner].filter((r) => r.length >= 4);
  }).filter((p) => p.length);
  const name = doc.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() ?? "";
  return { name, geojson: { type: "MultiPolygon", coordinates: polys } };
}

export default function AreaPicker() {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("search");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pts, setPts] = useState<[number, number][]>([]);
  // Protected areas around the visitor (IP area) or around a place they found.
  const [near, setNear] = useState<{ label: string; hits: Hit[] | null } | null>(null);
  async function loadNear(lat: number, lon: number, label: string) {
    setNear({ label, hits: null });
    try {
      const r = await fetch(`/api/v1/areas/nearby?lat=${lat}&lon=${lon}&km=100`);
      const j = await r.json();
      setNear({ label, hits: r.ok && Array.isArray(j) ? j : [] });
    } catch { setNear({ label, hits: [] }); }
  }
  useEffect(() => {
    fetch("/api/v1/near").then((r) => r.json()).then((n: { lat?: number; lon?: number }) => { if (n.lat != null && n.lon != null) loadNear(n.lat, n.lon, ""); }).catch(() => {});
  }, []);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);

  async function create(body: object) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/v1/areas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error(j.error ?? "Could not create that area.");
      router.push(`/report/area/${j.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true); setErr(null); setHits(null);
    try {
      const r = await fetch(`/api/v1/areas/search?q=${encodeURIComponent(q.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setHits(j);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  async function upload(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      const text = await f.text();
      const parsed = /\.kml$/i.test(f.name) || text.trimStart().startsWith("<") ? kmlToGeoJson(text) : { name: "", geojson: JSON.parse(text) };
      await create({ name: name || parsed.name || f.name.replace(/\.[^.]+$/, ""), geojson: parsed.geojson, source: "upload" });
    } catch (e) { setErr(e instanceof Error ? e.message : t("Could not read that file. Use KML or GeoJSON.")); }
  }

  // Drawing: click to add corners; the shape closes itself.
  useEffect(() => {
    if (mode !== "draw") return;
    let cancelled = false;
    import("maplibre-gl").then(({ Map: M, NavigationControl, setWorkerUrl }) => {
      if (cancelled || !box.current) return;
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const map = new M({ container: box.current, style: "https://tiles.openfreemap.org/styles/liberty", center: [78, 20], zoom: 3.5, attributionControl: { compact: true } });
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.addSource("draw", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "draw-fill", type: "fill", source: "draw", paint: { "fill-color": "#0891b2", "fill-opacity": 0.2 } });
        map.addLayer({ id: "draw-line", type: "line", source: "draw", paint: { "line-color": "#0e7490", "line-width": 2 } });
        map.addLayer({ id: "draw-pts", type: "circle", source: "draw", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": "#0e7490" } });
      });
      map.on("click", (e) => setPts((p) => [...p, [Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))]]));
      mapRef.current = map;
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [mode]);

  useEffect(() => {
    const src = mapRef.current?.getSource("draw") as GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));
    if (pts.length >= 3) features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] } });
    else if (pts.length === 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } });
    src.setData({ type: "FeatureCollection", features });
  }, [pts]);

  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setErr(null); }} className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? "bg-cyan-500 text-slate-950 font-medium" : "border border-white/15 text-slate-200 hover:bg-white/5"}`}>{label}</button>
  );

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap gap-2">
        {tab("search", t("Find a district or protected area"))}
        {tab("upload", t("Upload a boundary"))}
        {tab("draw", t("Draw on a map"))}
      </div>

      {mode === "search" && (
        <form onSubmit={search} className="mt-4">
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("A park, reserve, district or town anywhere, for example Kruger, Mudumalai, Nilgiris")} className="flex-1 rounded-md border border-white/15 bg-slate-950 px-3 py-2 text-slate-100" />
            <button disabled={busy} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{t("Search")}</button>
          </div>
          {hits && hits.length === 0 && <p className="mt-3 text-sm text-amber-300">{t("No area with a boundary found. Try another spelling, upload a KML, or draw it.")}</p>}
          {hits && hits.length > 0 && (
            <ul className="mt-3 divide-y divide-white/10 rounded-md border border-white/10">
              {hits.map((h) => (
                <li key={h.osm} className="flex items-center">
                  <button type="button" disabled={busy} onClick={() => create({ osm: h.osm })} className="flex-1 px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50">
                    <span className="block text-slate-100">{h.name}</span><span className="text-xs text-slate-400">{t(label(h.type))}</span>
                  </button>
                  {!PROTECTED.test(h.type) && <button type="button" onClick={() => loadNear(h.lat, h.lon, h.name.split(",")[0])} className="shrink-0 px-3 text-xs text-cyan-400 hover:underline">{t("Protected areas around here")}</button>}
                </li>
              ))}
            </ul>
          )}
          {near && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-200">{near.label ? `${t("Protected areas around here")}: ${near.label}` : t("Protected areas near you")}</h3>
              {near.hits === null && <p className="mt-1 text-sm text-slate-400">{t("Loading protected areas…")}</p>}
              {near.hits && near.hits.length === 0 && <p className="mt-1 text-sm text-slate-400">{t("No protected areas with a boundary found within 100 km.")}</p>}
              {near.hits && near.hits.length > 0 && (
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {near.hits.map((h) => (
                    <li key={h.osm}><button type="button" disabled={busy} onClick={() => create({ osm: h.osm })} className="w-full rounded-md border border-white/10 px-3 py-1.5 text-left hover:bg-white/5 disabled:opacity-50">
                      <span className="block text-sm text-slate-100">{h.name}</span><span className="text-xs text-slate-400">{t(h.type)} · {h.km} km</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">{t("Boundaries from OpenStreetMap. Check them against the official map before you rely on a report.")}</p>
        </form>
      )}

      {mode === "upload" && (
        <div className="mt-4 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name of the area (optional)")} className="w-full rounded-md border border-white/15 bg-slate-950 px-3 py-2 text-slate-100" />
          <input type="file" accept=".kml,.geojson,.json,application/vnd.google-earth.kml+xml,application/geo+json" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} className="block text-sm text-slate-300" />
          <p className="text-xs text-slate-400">{t("KML or GeoJSON with a polygon, such as a protected area or forest division boundary. A shapefile can be saved as KML in QGIS or Google Earth. The boundary is simplified and kept so the report link keeps working.")}</p>
        </div>
      )}

      {mode === "draw" && (
        <div className="mt-4">
          <p className="text-sm text-slate-300">{t("Click the map to add corners. The shape closes itself.")}</p>
          <div ref={box} className="mt-2 h-[55vh] max-h-[480px] overflow-hidden rounded-lg border border-white/10" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name of the area (optional)")} className="flex-1 min-w-[12rem] rounded-md border border-white/15 bg-slate-950 px-3 py-1.5 text-slate-100" />
            <button type="button" onClick={() => setPts((p) => p.slice(0, -1))} disabled={!pts.length} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50">{t("Undo")}</button>
            <button type="button" onClick={() => setPts([])} disabled={!pts.length} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50">{t("Clear")}</button>
            <button type="button" disabled={pts.length < 3 || busy} onClick={() => create({ name, geojson: { type: "Polygon", coordinates: [[...pts, pts[0]]] }, source: "drawn" })} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{t("Make the report")}</button>
          </div>
        </div>
      )}
      {busy && <p className="mt-3 text-sm text-slate-400">{t("Working…")}</p>}
      {err && <p className="mt-3 text-sm text-amber-300">{err}</p>}
    </div>
  );
}
