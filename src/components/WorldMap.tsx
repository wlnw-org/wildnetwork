"use client";

import PausedNotice from "@/components/PausedNotice";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ICON_IMAGE, registerIcons } from "@/lib/mapIcons";
import AboutPanel from "./AboutPanel";
import AskPanel from "./AskPanel";
import { track } from "./Analytics";
import SpeciesPanel, { type SpeciesDetail } from "./SpeciesPanel";
import PlacePanel, { type PickedPlace } from "./PlacePanel";
import HistoryPanel, { type History, type Period } from "./HistoryPanel";
import { areaFor, type XcArea } from "@/lib/xenocanto";
import Tour, { TOUR_KEY } from "./Tour";
import { LANGS, fmtNum, setLang, useLang, useT, type Lang } from "@/lib/i18n";
import { regionOf } from "@/lib/regions";


type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
interface Species { scientificName: string; vernacularName: string | null; count: number; deployments: number }
interface Insights {
  summary?: string[];
  coverage: { from: string; to: string; species: number; detections: number };
  movers: { scientificName: string; vernacularName: string | null; yesterday: number; avg7: number; ratio: number; ratioLow?: number | null; ratioHigh?: number | null }[];
  drift: { scientificName: string; vernacularName: string | null; region: string; driftDeg: number; latNow: number; n: number; driftLow?: number | null; driftHigh?: number | null }[];
  arrivals: { scientificName: string; vernacularName: string | null; cellLat: number; cellLon: number; n: number }[];
  seasonal?: { scientificName: string; vernacularName: string | null; cellLat: number; cellLon: number; week: string; n: number }[];
  possible?: { scientificName: string; vernacularName: string | null; cellLat: number; cellLon: number; week: string; n: number }[];
  common?: { scientificName: string; vernacularName: string | null; n: number; cells: number }[];
  area?: { region: string | null; scope: Record<"seasonal" | "possible" | "common" | "arrivals", "near" | "region" | "world"> } | null;
}

interface Movement { scientificName: string; frames: { week: string; total: number; index: number; cells: [number, number, number, number][]; centroids: { region: string; n: number; lat: number; lon: number }[] }[] }
interface Status { ask?: boolean; alerts?: boolean; paused?: string[]; live: boolean; lastPullAt: string | null; events1h: number; sensors: number; detections: number; species: number }

const CLASSES: { key: string; label: string }[] = [
  { key: "all", label: "All" }, { key: "avian", label: "Birds" }, { key: "bat", label: "Bats" },
  { key: "amphibian", label: "Frogs" }, { key: "insect", label: "Insects" }, { key: "mammal", label: "Mammals" }, { key: "marine", label: "Marine" },
];

const EMPTY: FC = { type: "FeatureCollection", features: [] };
const STYLE = "https://tiles.openfreemap.org/styles/dark";
const HOURS = [1, 3]; // the live window of single detections
const PERIODS: Period[] = ["7d", "30d", "12m"]; // past periods, drawn from the daily and weekly rollups
// Validated for the dark surface (dataviz validator): sources are categorical, change is diverging.
const SOURCE_COLOR: unknown[] = ["match", ["get", "source"], "birdweather", "#0891b2", "inaturalist", "#65a30d", "gbif", "#f59e0b", "wildnetwork-base", "#a78bfa", "acartia", "#60a5fa", "orcasound", "#2dd4bf", "obis", "#38bdf8", "#db2777"];
// Marine records (OBIS, Orcasound, Acartia) are mostly older than the 1 to 3 hour live window (OBIS lags by months and killer
// whale records are shown a day late), so the map draws them as their own layer from /api/v1/marine, spread evenly over space.
const MARINE_DAYS = 365;

// Sources whose review field is a human check of a machine detection (GBIF and iNaturalist records are human observations).
const REVIEWED: Record<string, boolean> = { "speciesnet-studio": true, "wildnetwork-base": true, speciesnet: true, "birdnet-pi": true, "birdnet-go": true, other: true };

type Scope = "near" | "region" | "world";
// Visible keyboard focus for every control on the map page.
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400";

/** fetch + JSON with a timeout (an aborted or non-2xx request rejects), returning the response headers too. */
async function getJson<T>(url: string, ms = 20_000): Promise<{ data: T; headers: Headers }> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return { data: (await r.json()) as T, headers: r.headers };
  } finally { clearTimeout(id); }
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Legend open or folded, remembered per browser (server render and first paint: folded).
const LEGEND_KEY = "wn_legend";
const legendListeners = new Set<() => void>();
function subscribeLegend(fn: () => void) { legendListeners.add(fn); return () => { legendListeners.delete(fn); }; }
let legendMem = false; // used when storage is blocked
function readLegend() { try { const v = localStorage.getItem(LEGEND_KEY); return v === null ? legendMem : v === "1"; } catch { return legendMem; } }
function setLegendOpen(v: boolean) { legendMem = v; try { localStorage.setItem(LEGEND_KEY, v ? "1" : "0"); } catch {} legendListeners.forEach((fn) => fn()); }

export default function WorldMap() {
  const t = useT();
  const scopeLabel = (sc?: Scope) => !sc ? null : sc === "near" ? (home?.city ? t("Near {place}", { place: home.city }) : t("Near you")) : sc === "region" ? t("Your region") : t("Worldwide");
  const lang = useLang();
  const weekLabel = (w: string) => new Date(w + "T00:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "short", timeZone: "UTC" });
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hours, setHours] = useState(3);
  const [period, setPeriod] = useState<Period | null>(null);
  const [history, setHistory] = useState<{ key: string; data: History } | null>(null);
  // Map click handlers are bound once at load, so they read the current period and pick() through refs.
  const historyRef = useRef<{ period: Period | null; group: string }>({ period: null, group: "all" });
  const pickRef = useRef<(name: string) => void>(() => {});
  const [species, setSpecies] = useState<string | null>(null);
  // Continent in view when a species is picked: Listen prefers recordings from there. Only this name is sent, never coordinates.
  const [listenArea, setListenArea] = useState<XcArea | null>(null);
  // Map centre rounded to whole degrees (about 100 km): enough to pick the country for Listen, never finer.
  const [listenNear, setListenNear] = useState<string | null>(null);
  const [speciesList, setSpeciesList] = useState<{ list: Species[]; scope?: Scope }>({ list: [] });
  const [insights, setInsights] = useState<Insights | null>(null);
  const [query, setQuery] = useState("");
  const [sightings, setSightings] = useState<FC>(EMPTY);
  // Off on first load (the legend toggle turns it on); choosing the Marine class or a species shows its records regardless.
  const [showMarine, setShowMarine] = useState(false);
  const [deployments, setDeployments] = useState<FC>(EMPTY);
  const [cells, setCells] = useState<FC>(EMPTY);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [tab, setTab] = useState<"now" | "feed" | "ask" | "about" | "place" | null>("now");
  const [place, setPlace] = useState<PickedPlace | null>(null);
  // Search answers are kept with the query they answer, so a pending search shows "Searching" and never a stale or empty list.
  const [placeHits, setPlaceHits] = useState<{ q: string; list: (PickedPlace & { key: string })[] }>({ q: "", list: [] });
  const [group, setGroup] = useState("all");
  const [results, setResults] = useState<{ q: string; list: Species[] }>({ q: "", list: [] });
  const [activeOpt, setActiveOpt] = useState(-1);
  // Search has its own debounced request, so typing does not reload the map.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      getJson<Species[]>(`/api/v1/species?q=${encodeURIComponent(q)}`).then(({ data }) => { if (!cancelled) setResults({ q, list: Array.isArray(data) ? data : [] }); })
        .catch(() => { if (!cancelled) setResults({ q, list: [] }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);
  const [status, setStatus] = useState<Status | null>(null);
  const [coverage, setCoverage] = useState<{ summary: Record<string, number>; cells: { lat: number; lon: number; status: string; acoustic: number; observed: number }[] } | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  // Map legend starts folded so the list of sources does not cover the map; the choice is remembered.
  const legendOpen = useSyncExternalStore(subscribeLegend, readLegend, () => false);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [frame, setFrame] = useState<number | null>(null); // index into movement.frames; null = live view
  const [mvPlaying, setMvPlaying] = useState(false);

  const thumbsRef = useRef<Record<string, string | null>>({});
  // Local first: the panel lists follow the visitor's area (IP area or a ?lat&lon link) unless they choose the whole world.
  const [home, setHome] = useState<{ lat: number; lon: number; city?: string | null } | null>(null);
  // Set when the map has eased to the visitor's area and no live dot is in view: offers the last 7 days instead of an empty map.
  const [quietNear, setQuietNear] = useState<"near" | "here" | null>(null);
  // True once the visitor has moved the map or picked a place: the late visitor-area ease must not pull the map away again.
  const userMovedRef = useRef(false);
  const [homeReady, setHomeReady] = useState(false);
  const [areaWorld, setAreaWorld] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem("wn_area_world") === "1"; } catch { return false; } });
  const liveHours = group === "bat" && !species ? 24 : hours; // the bat layer covers a day
  // Live detections are stored with the key (window, species, class) they were fetched for. "Loading" is derived from that
  // key, so it can never stick: it ends when a response for the current key lands, or when that key has failed (liveFail).
  const liveKey = `${liveHours}|${species ?? ""}|${group}`;
  const [live, setLive] = useState<{ key: string; fc: FC; at: number }>({ key: "", fc: EMPTY, at: 0 });
  const [liveFail, setLiveFail] = useState<string | null>(null);
  const events = live.key === liveKey ? live.fc : EMPTY;
  const loading = live.key !== liveKey && liveFail !== liveKey;
  const failed = live.key !== liveKey && liveFail === liveKey;
  // Merged BirdWeather points carry a count n, so totals add those up rather than counting points.
  const detections = useMemo(() => events.features.reduce((t, f) => t + (Number(f.properties?.n) || 1), 0), [events]);
  const windowStart = useMemo(() => live.at - liveHours * 3600_000, [live.at, liveHours]);
  const [sheetFull, setSheetFull] = useState(false); // phones: the panel is a bottom sheet, peek or expanded
  const [moreOpen, setMoreOpen] = useState(false); // phones: page links under "More" in the bottom bar

  // MapLibre (about 300 KB compressed) is loaded after the page is interactive, so the panels and data requests do not wait for it.
  useEffect(() => {
    let cancelled = false;
    let mapInstance: MLMap | null = null;
    import("maplibre-gl").then(({ AttributionControl, Map: MLMapClass, NavigationControl, Popup, setWorkerUrl }) => {
    if (cancelled || !containerRef.current || mapRef.current) return;
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map = new MLMapClass({ container: containerRef.current, style: STYLE, center: [10, 25], zoom: 1.7, minZoom: 1.3, renderWorldCopies: false, attributionControl: false });
    map.addControl(new AttributionControl({ compact: true, customAttribution: "BirdWeather · GBIF publishers (CC0/CC BY) · iNaturalist (CC0/CC-BY) · WDX producers" }));
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    // Start near the visitor (IP area, whole degrees, from /api/v1/near) unless a species link sets the view; zoom out for the world.
    const qs = new URLSearchParams(window.location.search);
    const dl = { lat: Number(qs.get("lat")), lon: Number(qs.get("lon")) };
    if (qs.has("lat") && Number.isFinite(dl.lat) && Number.isFinite(dl.lon)) {
      map.jumpTo({ center: [dl.lon, dl.lat], zoom: 6 });
      setHome({ lat: dl.lat, lon: dl.lon }); setHomeReady(true);
    } else {
      getJson<{ lat?: number; lon?: number; city?: string | null }>("/api/v1/near", 8000).then(({ data: n }) => {
        if (cancelled || n.lat == null || n.lon == null) return;
        setHome({ lat: n.lat, lon: n.lon, city: n.city });
        if (!qs.has("species") && !userMovedRef.current) {
          map.easeTo({ center: [n.lon, n.lat], zoom: 4, duration: 1800, padding: { top: 0, bottom: 0, right: 0, left: window.innerWidth >= 768 ? 420 : 0 } });
          map.once("moveend", () => setTimeout(() => {
            if (cancelled) return;
            try { if (map.getLayer("events") && map.queryRenderedFeatures({ layers: ["events"] }).length === 0) setQuietNear("near"); } catch { /* style not ready */ }
          }, 4000));
        }
      }).catch(() => {}).finally(() => { if (!cancelled) setHomeReady(true); });
    }
    map.on("movestart", (e) => { if ((e as { originalEvent?: unknown }).originalEvent) userMovedRef.current = true; });
    map.on("load", () => {
      // On phones the attribution starts folded to its (i) button instead of covering the bottom of the map.
      if (window.innerWidth < 768) containerRef.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      map.addSource("cells", { type: "geojson", data: EMPTY });
      map.addSource("deployments", { type: "geojson", data: EMPTY });
      map.addSource("events", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "cells", type: "fill", source: "cells",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "change"], -1, "#3b82f6", 0, "#64748b", 1, "#ea580c"],
          "fill-opacity": ["interpolate", ["linear"], ["get", "weight"], 0, 0.08, 1, 0.45],
        },
      });
      map.addSource("week-cells", { type: "geojson", data: EMPTY });
      map.addSource("track", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "week-cells", type: "fill", source: "week-cells",
        paint: { "fill-color": "#22d3ee", "fill-opacity": ["interpolate", ["linear"], ["get", "share"], 0, 0.04, 1, 0.7], "fill-outline-color": "rgba(34,211,238,0.25)" },
      });
      map.addLayer({ id: "track-line", type: "line", source: "track", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f8fafc", "line-width": 3, "line-opacity": 0.75 } });
      map.addLayer({ id: "track-head", type: "circle", source: "track", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#f8fafc", "circle-stroke-width": 2, "circle-stroke-color": "#020617" } });
      // Coverage: which cells recordings, sightings or both watch well enough to use (see /methods#coverage).
      map.addSource("coverage", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "coverage", type: "fill", source: "coverage",
        paint: {
          "fill-color": ["match", ["get", "status"], "both", "#a78bfa", "acoustic", "#22d3ee", "observed", "#f59e0b", "#64748b"],
          "fill-opacity": ["match", ["get", "status"], "thin", 0.12, 0.35],
          "fill-outline-color": "rgba(255,255,255,0.15)",
        },
      });
      map.addLayer({ id: "deployments", type: "circle", source: "deployments", paint: { "circle-radius": 2, "circle-color": "#475569", "circle-opacity": 0.7 } });
      map.addLayer({
        id: "events-glow", type: "circle", source: "events",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 6, 8, 14], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.18, "circle-blur": 1 },
      });
      map.addLayer({
        id: "events", type: "circle", source: "events",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 8, 6], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.95, "circle-stroke-width": 0.5, "circle-stroke-color": "#020617" },
      });
      // Past periods: one marker per cell at its centre, for the cell's most recorded species (icons from zoom 3.5, as for live dots).
      map.addSource("history-pts", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "history-glow", type: "circle", source: "history-pts",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 6, 8, 14], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.18, "circle-blur": 1 },
      });
      map.addLayer({
        id: "history-pts", type: "circle", source: "history-pts",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 8, 6], "circle-color": SOURCE_COLOR as never, "circle-opacity": 0.95, "circle-stroke-width": 0.5, "circle-stroke-color": "#020617" },
      });
      registerIcons(map).then(() => {
        if (!map.getLayer("history-icons")) map.addLayer({
          id: "history-icons", type: "symbol", source: "history-pts", minzoom: 3.5, filter: ["!=", ["get", "group"], "Unknown"],
          layout: { "icon-image": ICON_IMAGE as never, "icon-size": ["interpolate", ["linear"], ["zoom"], 3.5, 0.45, 8, 0.8], "icon-padding": 1 },
        });
        if (map.getLayer("events-icons")) return;
        map.addLayer({
          id: "events-icons", type: "symbol", source: "events", minzoom: 3.5, filter: ["!=", ["get", "group"], "Unknown"],
          layout: { "icon-image": ICON_IMAGE as never, "icon-size": ["interpolate", ["linear"], ["zoom"], 3.5, 0.45, 8, 0.8], "icon-padding": 1 },
        });
      }).catch((err) => console.error("icon load failed", err));
      const showPopup = (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        // Names, links and credits come from pushed or third-party data, so everything is escaped before it reaches setHTML.
        const media = p.media && /^https:\/\//.test(p.media)
          ? p.mediaType === "audio" ? `<audio controls src="${esc(p.media)}" style="width:220px;margin-top:6px"></audio>` : `<img src="${esc(p.media)}" style="width:220px;margin-top:6px;border-radius:6px" alt="" />`
          : "";
        // Human sightings (WDX observationMethod "human") have no confidence: show the count and the source's own verification instead.
        const human = String(p.human) === "true";
        const what = human
          ? `${Number(p.count) > 1 ? `${Number(p.count)} animals ` : Number(p.count) === 1 ? "1 animal " : ""}observed by people${String(p.trusted) === "true" ? ", trusted observer" : String(p.trusted) === "false" ? ", not verified by the source" : ""}${String(p.unmapped) === "true" ? "<br/>species not mapped yet" : ""}`
          : p.model ? (p.model === "unspecified" ? "machine observation, model not named" : `detected by ${esc(p.model)} (no score published)`) : `${Number(p.n) > 1 ? `${Number(p.n)} detections nearby in 15 min, best ` : ""}confidence ${Number(p.conf).toFixed(2)} · ${esc(p.source)}`;
        // Credit lines link to the dataset or feed page; only https links are used.
        const link = (t: string, u?: string) => (u && /^https:\/\//.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noreferrer" style="color:#22d3ee">${esc(t)}</a>` : esc(t));
        const notes = [p.rounded ? `position rounded to ${esc(p.rounded)}°` : "", p.delayed ? `shown ${esc(p.delayed)} h late` : "", p.license && /creativecommons/.test(p.license) ? link(p.license.includes("/by-nc") ? "CC BY-NC" : p.license.includes("zero") ? "CC0" : "CC BY", p.license) : ""].filter(Boolean).join(", ");
        const credit = p.credit ? `<br/><span style="font-size:11px;color:#94a3b8">${link(p.credit, p.creditUrl)}${p.alsoCredit ? `. ${esc(p.alsoCredit)}` : ""}${notes ? `. ${notes.charAt(0).toUpperCase()}${notes.slice(1)}` : ""}.</span>` : "";
        const text = `<b>${esc(p.common ?? p.sci)}</b>${p.sci ? `<br/><i>${esc(p.sci)}</i>` : ""}<br/>${new Date(p.t).toLocaleString()}<br/>${what}${REVIEWED[p.source] ? (p.review === "confirmed" ? "<br/>confirmed by a reviewer" : p.review === "uncertain" ? "<br/>reviewer unsure" : "") : ""}${credit}`;
        const popup = new Popup({ closeButton: false, maxWidth: "260px" })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<div style="font:13px system-ui;color:#e2e8f0">${text}${media}</div>`)
          .addTo(map);
        // Detections without their own photo or recording get the species photo (Wikipedia / iNaturalist, cached by /api/v1/media).
        if (!p.media && p.sci) {
          fetch(`/api/v1/media?names=${encodeURIComponent(p.sci)}`).then((r) => r.json()).then((m: Record<string, { thumbUrl: string | null; attribution: string | null }>) => {
            const t = m[p.sci];
            if (!t?.thumbUrl || !/^https:\/\//.test(t.thumbUrl) || !popup.isOpen()) return;
            popup.setHTML(`<div style="font:13px system-ui;color:#e2e8f0">${text}<img src="${esc(t.thumbUrl)}" style="width:220px;margin-top:6px;border-radius:6px" alt="" /><div style="font-size:10px;color:#94a3b8;margin-top:2px">${esc(t.attribution)}</div></div>`);
          }).catch(() => {});
        }
      };
      // Past period: the clicked species and its records in that area, then the area's other top species; names open the species panel.
      const showCell = (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const h = historyRef.current;
        // The dot and its icon are two layers under one click: open a single popup.
        const ev = e.originalEvent as MouseEvent & { wnCell?: boolean };
        if (!f || !h.period || ev.wnCell) return;
        ev.wnCell = true;
        const p = f.properties as Record<string, string | number>;
        const lat = Number(p.cellLat), lon = Number(p.cellLon);
        const label = h.period === "12m" ? "last 12 months" : h.period === "30d" ? "last 30 days" : "last 7 days";
        const src = String(p.source) === "birdweather" ? "BirdWeather stations" : String(p.source) === "gbif" ? "GBIF records" : String(p.source) === "inaturalist" ? "iNaturalist" : String(p.source);
        const head = `<button data-sci="${esc(p.sci)}" style="background:none;border:0;padding:0;cursor:pointer;text-align:left;color:#e2e8f0;font:13px system-ui"><b>${esc(p.common ?? p.sci)}</b><br/><i>${esc(p.sci)}</i></button>`
          + `<br/>${Math.round(Number(p.n)).toLocaleString()} records, ${label}<br/><span style="font-size:11px;color:#94a3b8">Mostly from ${esc(src)}, in the area ${lat}° to ${lat + 5}°, ${lon}° to ${lon + 5}°. The dot marks the area, not where it was recorded.</span>`;
        const popup = new Popup({ closeButton: true, maxWidth: "280px" })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<div style="font:13px system-ui;color:#e2e8f0">${head}</div>`)
          .addTo(map);
        popup.getElement().addEventListener("click", (ev) => {
          const b = (ev.target as HTMLElement).closest("[data-sci]") as HTMLElement | null;
          if (b?.dataset.sci) { popup.remove(); pickRef.current(b.dataset.sci); }
        });
        fetch(`/api/v1/history/cell?period=${h.period}&group=${h.group}&lat=${lat}&lon=${lon}`).then((r) => r.json())
          .then((d: { species?: { sci: string; common: string | null; n: number }[] }) => {
            if (!popup.isOpen()) return;
            const rows = (d.species ?? []).filter((x) => x.sci !== p.sci).slice(0, 8).map((x) => `<button data-sci="${esc(x.sci)}" style="display:flex;width:100%;gap:8px;justify-content:space-between;padding:3px 0;background:none;border:0;color:#e2e8f0;cursor:pointer;text-align:left;font:13px system-ui"><span style="color:#22d3ee">${esc(x.common ?? x.sci)}</span><span style="color:#94a3b8">${Math.round(x.n).toLocaleString()}</span></button>`).join("");
            popup.setHTML(`<div style="font:13px system-ui;color:#e2e8f0">${head}${rows ? `<div style="margin-top:8px;font-size:11px;color:#94a3b8">Also most recorded here</div><div>${rows}</div>` : ""}</div>`);
          }).catch(() => {});
      };
      for (const layer of ["history-pts", "history-icons"]) {
        map.on("click", layer, showCell);
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      for (const layer of ["events", "events-icons"]) {
        map.on("click", layer, showPopup);
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      setReady(true);
    });
    mapRef.current = map;
    (window as unknown as { __wnMap?: MLMap }).__wnMap = map;
    mapInstance = map;
    });
    return () => { cancelled = true; mapInstance?.remove(); mapRef.current = null; };
  }, []);

  // Each request paints as soon as it arrives; the map never waits for the slowest one.
  // Each load gets a number; a response from an older load (e.g. "All" finishing after a switch to "Marine") is dropped.
  const loadSeq = useRef(0);
  const wantThumbs = useCallback((names: string[]) => {
    const missing = [...new Set(names)].filter((n) => n && n !== "null" && !(n in thumbsRef.current)).slice(0, 40);
    if (!missing.length) return;
    for (const n of missing) thumbsRef.current[n] = null; // claimed, so parallel calls do not refetch
    fetch(`/api/v1/media?names=${encodeURIComponent(missing.join(","))}`).then((r) => r.json()).then((m: Record<string, { thumbUrl: string | null }>) => {
      setThumbs((t) => { const next = { ...t }; for (const n of missing) next[n] = m[n]?.thumbUrl ?? null; thumbsRef.current = { ...thumbsRef.current, ...next }; return next; });
    }).catch(() => {});
  }, []);

  // Panel lists: near the visitor first (the server widens to their region, then the world, when an area has too little data).
  useEffect(() => {
    if (!homeReady) return;
    let live = true;
    const q = new URLSearchParams();
    if (group !== "all") q.set("group", group);
    if (home && !areaWorld) { q.set("lat", String(Math.round(home.lat))); q.set("lon", String(Math.round(home.lon))); }
    fetch(`/api/v1/insights${q.size ? "?" + q : ""}`).then((r) => r.json() as Promise<Insights>).then((ins) => {
      if (!live) return;
      setInsights(ins);
      wantThumbs([...(ins.possible ?? []), ...(ins.seasonal ?? []), ...(ins.common ?? []), ...ins.drift, ...ins.movers, ...ins.arrivals].map((x) => x.scientificName));
    }).catch(() => {});
    return () => { live = false; };
  }, [group, home, homeReady, areaWorld, wantThumbs]);

  // Live detections for the current key. Each request times out after 20 s and is retried twice (3 s, then 6 s later);
  // after that the key is marked failed (Feed offers a retry) and the 2 minute refresh tries again. A response is kept
  // only if it is for the key the map shows now, so a slow answer for an earlier class or species cannot replace it.
  const liveKeyRef = useRef(liveKey);
  useEffect(() => { liveKeyRef.current = liveKey; }, [liveKey]);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const key = liveKey;
    const from = new Date(Math.floor((Date.now() - liveHours * 3600_000) / 300_000) * 300_000).toISOString(); // 5 minute steps, cacheable
    const u = new URLSearchParams({ from, limit: "20000", merge: "1" });
    if (species) u.set("species", species);
    else if (group !== "all") u.set("group", group);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt));
      if (liveKeyRef.current !== key) return;
      try {
        const { data: ev } = await getJson<FC>(`/api/v1/events?${u}`);
        if (!Array.isArray(ev?.features)) throw new Error("events: no features");
        if (liveKeyRef.current !== key) return;
        setLive({ key, fc: ev, at: Date.now() });
        setLiveFail((f) => (f === key ? null : f));
        wantThumbs(ev.features.slice(0, 40).map((f) => String(f.properties.sci)));
        return;
      } catch (err) {
        console.warn("live detections", err);
      }
    }
    // Only the newest load reports failure, so an older failing request cannot mark a key that a newer one is still fetching.
    if (seq === loadSeq.current && liveKeyRef.current === key) setLiveFail(key);
  }, [liveKey, liveHours, species, group, wantThumbs]);

  // Status (the live dot and totals) and the "Most detected" list have their own requests, so neither can hold up the dots.
  useEffect(() => {
    let off = false;
    const get = () => getJson<Status>(`/api/v1/status`, 15_000).then(({ data }) => { if (!off) setStatus(data); }).catch(() => {});
    const t0 = setTimeout(get, 0);
    const t = setInterval(get, 120_000);
    return () => { off = true; clearTimeout(t0); clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!homeReady) return;
    let off = false;
    const q = new URLSearchParams({ hours: String(group === "marine" ? MARINE_DAYS * 24 : group === "bat" ? 24 : hours) });
    if (group !== "all") q.set("group", group);
    if (home && !areaWorld) { q.set("lat", String(Math.round(home.lat))); q.set("lon", String(Math.round(home.lon))); }
    const get = () => getJson<Species[]>(`/api/v1/species?${q}`).then(({ data, headers }) => {
      if (off || !Array.isArray(data)) return;
      const sc = headers.get("x-wn-scope");
      setSpeciesList({ list: data, scope: sc === "near" || sc === "region" ? sc : "world" });
      wantThumbs(data.slice(0, 15).map((x) => x.scientificName));
    }).catch(() => {});
    const t0 = setTimeout(get, 0);
    const t = setInterval(get, 120_000);
    return () => { off = true; clearTimeout(t0); clearInterval(t); };
  }, [hours, group, home, homeReady, areaWorld, wantThumbs]);

  // Marine layer: its own window and its own fetch, following the view when zoomed in so dense coasts (India) fill in.
  const [marineView, setMarineView] = useState<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const onMove = () => {
      if (map.getZoom() < 4) return setMarineView(null);
      const b = map.getBounds();
      setMarineView([Math.floor(b.getWest()), Math.floor(b.getSouth()), Math.ceil(b.getEast()), Math.ceil(b.getNorth())].join(","));
    };
    map.on("moveend", onMove);
    return () => { map.off("moveend", onMove); };
  }, [ready]);
  useEffect(() => {
    if (!(group === "marine" || !!species || (showMarine && group === "all"))) { const t = setTimeout(() => setSightings(EMPTY), 0); return () => clearTimeout(t); }
    let cancelled = false;
    const get = () => fetch(`/api/v1/marine?${new URLSearchParams({ days: String(MARINE_DAYS), perCell: species ? "500" : marineView ? "15" : "40", ...(species ? { species } : {}), ...(marineView ? { bbox: marineView } : {}) })}`)
      .then((r) => r.json() as Promise<FC>).then((fc) => { if (!cancelled) setSightings(fc); }).catch(() => {});
    const t0 = setTimeout(get, 0);
    const t = setInterval(get, 600_000);
    return () => { cancelled = true; clearTimeout(t0); clearInterval(t); };
  }, [showMarine, group, species, marineView]);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(load, 120_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [load]);

  // Sensor locations change slowly and the response is large: once per visit, then every 10 minutes.
  useEffect(() => {
    const get = () => fetch(`/api/v1/deployments`).then((r) => r.json() as Promise<FC>).then(setDeployments).catch(() => {});
    const t0 = setTimeout(get, 0);
    const t = setInterval(get, 600_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);

  // Change cells for the selected species (recent 3 days vs week before).
  useEffect(() => {
    if (!species) return;
    let cancelled = false;
    fetch(`/api/v1/species/${encodeURIComponent(species)}`).then((r) => r.json()).then((d: SpeciesDetail) => {
      if (cancelled) return;
      const max = Math.max(1, ...d.cells.map((c) => c.n));
      if (d.cells.length && mapRef.current) {
        const lats = d.cells.map((c) => c.lat), lons = d.cells.map((c) => c.lon);
        // Phones: the panel is a bottom sheet over the lower ~45% of the screen, so the species is framed above it.
        const wide = window.innerWidth >= 768;
        mapRef.current.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons) + 5, Math.max(...lats) + 5]], { padding: wide ? { top: 60, bottom: 90, left: 480, right: 40 } : { top: 100, bottom: Math.round(window.innerHeight * 0.45) + 70, left: 20, right: 20 }, maxZoom: 5, duration: 1200 });
      }
      setCells({
        type: "FeatureCollection",
        // Change is computed from effort-corrected shares; cells not observed enough in either period are left out.
        features: d.cells.filter((c) => c.recent != null && c.earlier != null).map((c) => {
          const r = c.recent!, e = c.earlier!;
          const change = r + e === 0 ? 0 : Math.max(-1, Math.min(1, (r - e) / (r + e)));
          return {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[c.lon, c.lat], [c.lon + 5, c.lat], [c.lon + 5, c.lat + 5], [c.lon, c.lat + 5], [c.lon, c.lat]]] },
            properties: { change, weight: Math.log1p(c.n) / Math.log1p(max) },
          };
        }),
      });
    });
    return () => { cancelled = true; };
  }, [species]);

  // Weekly movement frames for the selected species (a year of history).
  useEffect(() => {
    if (!species) return;
    let cancelled = false;
    fetch(`/api/v1/species/${encodeURIComponent(species)}/movement`).then((r) => r.json()).then((d: Movement) => { if (!cancelled) setMovement(d); });
    return () => { cancelled = true; };
  }, [species]);

  const frames = useMemo(() => (species && movement?.scientificName === species ? movement.frames : []), [species, movement]);
  const activeFrame = species && frame !== null && frames[frame] ? frames[frame] : null;

  // Coverage layer: fetched once when first shown, hidden while a species is selected.
  useEffect(() => {
    if (!showCoverage || coverage) return;
    fetch(`/api/v1/coverage`).then((r) => r.json()).then(setCoverage).catch(() => {});
  }, [showCoverage, coverage]);
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("coverage") as GeoJSONSource | undefined;
    if (!map || !src) return;
    const on = showCoverage && !species && coverage;
    src.setData(on ? { type: "FeatureCollection", features: coverage.cells.map((c) => ({
      type: "Feature", properties: { status: c.status },
      geometry: { type: "Polygon", coordinates: [[[c.lon, c.lat], [c.lon + 5, c.lat], [c.lon + 5, c.lat + 5], [c.lon, c.lat + 5], [c.lon, c.lat]]] },
    })) } : EMPTY);
  }, [showCoverage, species, coverage, ready]);
  // Past period: totals per cell, most recorded and arrivals from /api/v1/history (cached for hours at the edge).
  const historyKey = period ? `${period}|${group}` : null;
  useEffect(() => {
    if (!period) return;
    let off = false;
    const q = new URLSearchParams({ period, group });
    if (home && !areaWorld) { q.set("lat", String(Math.round(home.lat))); q.set("lon", String(Math.round(home.lon))); }
    getJson<History>(`/api/v1/history?${q}`, 30_000)
      .then(({ data: d }) => { if (!off) setHistory({ key: `${period}|${group}`, data: d }); }).catch(() => {});
    return () => { off = true; };
  }, [period, group, home, areaWorld]);
  const historyData = history && history.key === historyKey ? history.data : null;

  // Past period dots: one per species per cell, placed on a station inside the cell when there is one (chosen by a hash
  // of the name, so a species keeps its spot between renders), otherwise at a hashed spot well inside the cell.
  const historyPts = useMemo<FC>(() => {
    if (!historyData?.points) return EMPTY;
    const stations = new Map<string, [number, number][]>();
    for (const f of deployments.features) {
      const [x, y] = (f.geometry as GeoJSON.Point).coordinates;
      const k = `${Math.floor(y / 5) * 5},${Math.floor(x / 5) * 5}`;
      (stations.get(k) ?? stations.set(k, []).get(k)!).push([x, y]);
    }
    const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
    return { type: "FeatureCollection", features: historyData.points.map(([lat, lon, sci, common, grp, src, n]) => {
      const h = hash(sci + lat + lon), st = stations.get(`${lat},${lon}`);
      const jx = ((h & 0xff) / 255 - 0.5) * 0.3, jy = (((h >> 8) & 0xff) / 255 - 0.5) * 0.3;
      const at: [number, number] = st?.length ? [st[h % st.length][0] + jx, st[h % st.length][1] + jy]
        : [lon + 0.5 + ((h & 0xffff) / 65535) * 4, lat + 0.5 + ((h >>> 16) / 65535) * 4];
      return { type: "Feature", properties: { cellLat: lat, cellLon: lon, n, sci, common, group: grp, source: src }, geometry: { type: "Point", coordinates: at } };
    }) } as FC;
  }, [historyData, deployments]);

  const shareScale = useMemo(() => {
    const all = frames.flatMap((f) => f.cells.map((c) => c[3])).sort((a, b) => a - b);
    return all.length ? Math.max(all[Math.floor(all.length * 0.95)], 1e-6) : 1;
  }, [frames]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const weekSrc = map.getSource("week-cells") as GeoJSONSource, trackSrc = map.getSource("track") as GeoJSONSource;
    if (activeFrame) {
      (map.getSource("history-pts") as GeoJSONSource)?.setData(EMPTY);
      // Shade by the species' share of all detections in the cell, scaled to the year's 95th percentile so weeks are comparable.
      weekSrc?.setData({ type: "FeatureCollection", features: activeFrame.cells.map(([lat, lon, , share]) => ({
        type: "Feature", properties: { share: Math.min(1, Math.sqrt(share / shareScale)) },
        geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 5, lat], [lon + 5, lat + 5], [lon, lat + 5], [lon, lat]]] },
      })) });
      // One centroid track per continent that holds at least 10% of the year's detections.
      const yearTotal = frames.reduce((a, f) => a + f.total, 0);
      const byRegion = new Map<string, { n: number; pts: [number, number][] }>();
      // Trail of the last 10 weeks only, so the track reads as recent movement and not a year of scribble.
      frames.slice(Math.max(0, frame! - 9), frame! + 1).forEach((f) => f.centroids.forEach((c) => {
        const g = byRegion.get(c.region) ?? { n: 0, pts: [] };
        g.pts.push([c.lon, c.lat]); byRegion.set(c.region, g);
      }));
      // 3-week moving average: weekly centres jump with noise, the trend is what matters.
      for (const g of byRegion.values()) {
        g.pts = g.pts.map((_, i) => {
          const w = g.pts.slice(Math.max(0, i - 1), i + 2);
          return [w.reduce((a, p) => a + p[0], 0) / w.length, w.reduce((a, p) => a + p[1], 0) / w.length] as [number, number];
        });
      }
      frames.forEach((f) => f.centroids.forEach((c) => { const g = byRegion.get(c.region); if (g) g.n += c.n; }));
      const feats: GeoJSON.Feature[] = [];
      for (const g of byRegion.values()) {
        if (g.n < yearTotal * 0.1) continue;
        if (g.pts.length > 1) feats.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: g.pts } });
        feats.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: g.pts[g.pts.length - 1] } });
      }
      trackSrc?.setData({ type: "FeatureCollection", features: feats });
      (map.getSource("cells") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("events") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
      return;
    }
    if (period && !species) {
      weekSrc?.setData(EMPTY); trackSrc?.setData(EMPTY);
      (map.getSource("history-pts") as GeoJSONSource)?.setData(historyPts);
      (map.getSource("cells") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("events") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
      return;
    }
    weekSrc?.setData(EMPTY); trackSrc?.setData(EMPTY);
    (map.getSource("history-pts") as GeoJSONSource)?.setData(EMPTY);
    (map.getSource("cells") as GeoJSONSource)?.setData(species ? cells : EMPTY);
    (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
    let fc = events;
    if (playhead !== null) {
      const cutoff = windowStart + playhead;
      const trail = Math.max(liveHours * 3600_000 * 0.05, 15 * 60_000);
      fc = { ...events, features: events.features.filter((f) => { const t = Date.parse(String(f.properties.t)); return t <= cutoff && t > cutoff - trail; }) };
    } else if (sightings.features.length) {
      fc = { ...events, features: [...events.features, ...sightings.features] };
    }
    (map.getSource("events") as GeoJSONSource)?.setData(fc);
  }, [events, sightings, deployments, cells, species, playhead, ready, windowStart, liveHours, activeFrame, frames, frame, shareScale, period, historyPts]);

  useEffect(() => {
    if (!playing) return;
    const total = liveHours * 3600_000;
    const id = setInterval(() => setPlayhead((p) => { const n = (p ?? 0) + total / 300; return n >= total ? 0 : n; }), 50);
    return () => clearInterval(id);
  }, [playing, liveHours]);

  const panelOpenNow = tab !== null || species !== null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const wide = window.innerWidth >= 768;
    map.easeTo({ padding: wide ? { left: panelOpenNow ? 454 : 70, top: 44, bottom: 100, right: 0 } : { left: 0, top: 88, right: 0, bottom: panelOpenNow ? Math.round(window.innerHeight * 0.45) + 56 : 140 }, duration: 300 });
  }, [panelOpenNow, ready]);

  // 8: on a phone the panel covers part of the map, so start with it closed.
  useEffect(() => {
    if (window.innerWidth < 768) { const t = setTimeout(() => setTab(null), 0); return () => clearTimeout(t); }
  }, []);

  useEffect(() => {
    if (!mvPlaying || frames.length === 0) return;
    const id = setInterval(() => setFrame((f) => ((f ?? -1) + 1) % frames.length), 450);
    return () => clearInterval(id);
  }, [mvPlaying, frames.length]);

  const total = liveHours * 3600_000;
  const selectSpecies = (name: string | null) => {
    const c = mapRef.current?.getCenter();
    setListenArea(c ? areaFor(c.lng, c.lat) : null);
    setListenNear(c ? `${Math.round(c.lat)},${Math.round(((c.lng + 540) % 360) - 180)}` : null);
    // Live dots follow from the species (see liveKey): nothing to clear here, so picking the same thing again is harmless.
    setSpecies(name); setPlayhead(null); setPlaying(false); setFrame(null); setMvPlaying(false);
  };
  const pick = (name: string) => { selectSpecies(name); setTab("now"); track("select_species", { species: name }); };
  useEffect(() => { pickRef.current = pick; historyRef.current = { period, group }; });

  // First-visit walkthrough: opens as soon as the page is interactive (it points at the bar, rail and slider, not the map
  // tiles), unless the visitor came for a species or has seen it. The About panel can replay it.
  const [tour, setTour] = useState<"auto" | "manual" | null>(null);
  useEffect(() => {
    const replay = () => setTour("manual");
    window.addEventListener("wn:tour", replay);
    return () => window.removeEventListener("wn:tour", replay);
  }, []);
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem(TOUR_KEY) === "done"; } catch {}
    if (seen || new URLSearchParams(window.location.search).has("species")) return;
    const t = setTimeout(() => setTour("auto"), 600);
    return () => clearTimeout(t);
  }, []);
  // Deep link from the species pages: /?species=Hirundo rustica
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get("species");
    if (!name) return;
    const id = setTimeout(() => { setSpecies(name); setTab("now"); }, 0);
    return () => clearTimeout(id);
  }, []);
  // Deep link from the place pages: /?lat=13.08&lon=80.27 opens that area's panel.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const lat = Number(qs.get("lat")), lon = Number(qs.get("lon"));
    if (!qs.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const id = setTimeout(() => { setPlace({ label: "This area", lat, lon }); setTab("place"); }, 0);
    return () => clearTimeout(id);
  }, []);
  // Place suggestions for the search box (server-side geocoder), debounced.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    let off = false;
    const id = setTimeout(() => {
      getJson<{ places: { name: string; admin1: string | null; country: string | null; lat: number; lon: number; slug: string }[] }>(`/api/v1/places?q=${encodeURIComponent(q)}`)
        .then(({ data: d }) => { if (!off) setPlaceHits({ q, list: (d.places ?? []).slice(0, 5).map((p) => ({ key: `${p.slug}${p.lat}`, slug: p.slug, lat: p.lat, lon: p.lon, label: [p.name, p.admin1, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") })) }); })
        .catch(() => { if (!off) setPlaceHits({ q, list: [] }); });
    }, 350);
    return () => { off = true; clearTimeout(id); };
  }, [query]);
  // Search list: species first when the query names species (places then capped at 2), places first when no species match.
  const sq = query.trim();
  const speciesPending = sq.length >= 2 && results.q !== sq;
  const placesPending = sq.length >= 3 && placeHits.q !== sq;
  const sp = results.q === sq ? results.list.slice(0, 20) : [];
  const pl = sq.length >= 3 && placeHits.q === sq ? placeHits.list.slice(0, sp.length ? 2 : 5) : [];
  type Opt = { kind: "species"; s: Species } | { kind: "place"; p: PickedPlace & { key: string } };
  const searchOpts: Opt[] = speciesPending ? [] : sp.length
    ? [...sp.map((s) => ({ kind: "species" as const, s })), ...pl.map((p) => ({ kind: "place" as const, p }))]
    : pl.map((p) => ({ kind: "place" as const, p }));
  const searchOpen = sq.length >= 2;
  const chooseOpt = (o: Opt) => { if (o.kind === "species") { pick(o.s.scientificName); setQuery(""); } else goPlace(o.p); setActiveOpt(-1); };
  const goPlace = (p: PickedPlace) => {
    selectSpecies(null); setPlace(p); setTab("place"); setQuery(""); setQuietNear(null);
    userMovedRef.current = true;
    const map = mapRef.current;
    if (map) {
      // Opening the panel eases the map padding (300 ms), which would cancel a flight started now: fly once it has settled.
      setTimeout(() => {
        map.flyTo({ center: [p.lon, p.lat], zoom: 7, duration: 1200 });
        // Live dots are often sparse at city zoom: offer the last 7 days instead of an empty map.
        map.once("moveend", () => setTimeout(() => {
          try { if (map.getLayer("events") && map.queryRenderedFeatures({ layers: ["events"] }).length === 0) setQuietNear("here"); } catch { /* style not ready */ }
        }, 2500));
      }, 350);
    }
    track("select_place", { place: p.slug ?? "" });
  };
  const flyTo = (f: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>) => {
    const c = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    mapRef.current?.flyTo({ center: c, zoom: Math.max(mapRef.current.getZoom(), 6), duration: 900 });
  };
  const panelOpen = tab !== null || species !== null;

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 font-sans overflow-clip">
      <div className="absolute inset-0"><div ref={containerRef} className="h-full w-full" /></div>

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 h-11 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center px-3 gap-3 z-20">
        {/* Home: a full load of / resets the view, the panel and any species or place in the address. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={`flex items-center gap-3 shrink-0 rounded ${FOCUS}`} aria-label="Wildlife Network home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="w-6 h-6 rounded-md" />
          <span className="font-semibold tracking-tight max-[400px]:text-sm">Wildlife Network</span>
        </a>
        {/* Neutral "Checking" until /api/v1/status first answers, so a fresh load does not flash red. */}
        <span className="flex items-center gap-1.5 text-xs text-slate-300" role="status">
          <span className={`inline-block w-2 h-2 rounded-full ${!status ? "bg-slate-500" : status.live ? "bg-[#7fd320]" : "bg-[#d0031b]"}`} />
          <span className="max-sm:sr-only">{!status ? t("Checking") : status.live ? t("Live") : t("Stale")}</span>{status?.lastPullAt && <span className="hidden sm:inline"> · {t("updated {t}", { t: relTime(status.lastPullAt, t) })}</span>}
        </span>
        <div className="flex-1" />
        <div data-tour="classes" className="hidden lg:flex items-center gap-1" role="group" aria-label={t("Animal class")}>
          {CLASSES.map((c) => (
            <button key={c.key} onClick={() => { track("select_class", { class: c.key }); setGroup(c.key); selectSpecies(null); if (tab === null) setTab("now"); }}
              className={`text-xs rounded px-2 py-1 ${FOCUS} ${group === c.key ? "bg-white/90 text-slate-900 font-medium" : "text-slate-300 hover:bg-white/10"}`}>
              {t(c.label)}
            </button>
          ))}
        </div>
        <select data-tour="classes" value={group} onChange={(e) => { setGroup(e.target.value); selectSpecies(null); }} aria-label={t("Animal class")}
          className={`lg:hidden rounded-md bg-white/10 px-2 py-1 text-sm outline-none ${FOCUS}`}>
          {CLASSES.map((c) => <option key={c.key} value={c.key} className="text-slate-900">{t(c.label)}</option>)}
        </select>
        {/* Search: in the bar on wide screens, a full-width row under it on phones. A combobox with arrow keys and Enter. */}
        <div data-tour="search" className="relative w-64 max-w-[40vw] max-md:absolute max-md:top-11 max-md:inset-x-0 max-md:w-auto max-md:max-w-none max-md:px-2 max-md:py-1.5 max-md:bg-black/80 max-md:backdrop-blur-xl max-md:border-b max-md:border-white/10">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setActiveOpt(-1); }} placeholder={t("Search a species or place")}
            role="combobox" aria-label={t("Search a species or place")} aria-expanded={searchOpen} aria-controls="wn-search-list" aria-autocomplete="list"
            aria-activedescendant={activeOpt >= 0 && activeOpt < searchOpts.length ? `wn-search-opt-${activeOpt}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && searchOpts.length) { e.preventDefault(); setActiveOpt((i) => (i + 1) % searchOpts.length); }
              else if (e.key === "ArrowUp" && searchOpts.length) { e.preventDefault(); setActiveOpt((i) => (i <= 0 ? searchOpts.length - 1 : i - 1)); }
              else if (e.key === "Enter" && searchOpts.length) { e.preventDefault(); chooseOpt(searchOpts[Math.max(0, activeOpt)]); }
              else if (e.key === "Escape") { setQuery(""); setActiveOpt(-1); }
            }}
            className={`w-full rounded-md bg-white/10 px-2.5 py-1 text-sm outline-none focus:bg-white/15 placeholder:text-slate-400 max-md:py-1.5 max-md:text-base ${FOCUS}`} />
          {searchOpen && (
            <div className="absolute top-full mt-1 left-0 right-0 md:left-auto md:w-[22rem] max-md:mx-2 max-h-[60vh] md:max-h-80 overflow-y-auto rounded-md bg-slate-900 border border-slate-700 shadow-xl">
              <ul id="wn-search-list" role="listbox" aria-label={t("Search results")}>
                {searchOpts.map((o, i) => {
                  const head = o.kind === "species" ? (i === 0 ? t("Species") : null) : (i === 0 || searchOpts[i - 1].kind !== "place" ? t("Places") : null);
                  return (
                    <li key={o.kind === "species" ? o.s.scientificName : o.p.key} id={`wn-search-opt-${i}`} role="option" aria-selected={i === activeOpt}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => chooseOpt(o)} onMouseEnter={() => setActiveOpt(i)}
                      className={`cursor-pointer ${i === activeOpt ? "bg-slate-800" : ""}`}>
                      {head && <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-slate-400" aria-hidden>{head}</div>}
                      {o.kind === "species" ? (
                        <div className="px-3 py-1.5 text-sm flex items-start gap-2">
                          <Thumb src={thumbs[o.s.scientificName]} size={6} />
                          <span className="min-w-0 break-words"><span className="block">{o.s.vernacularName ?? o.s.scientificName}</span>
                            {o.s.vernacularName && <span className="block text-slate-400 text-xs italic">{o.s.scientificName}</span>}</span>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 text-sm flex items-start gap-2">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></svg>
                          <span className="min-w-0 break-words">{o.p.label}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(speciesPending || (!searchOpts.length && placesPending)) && <div className="px-3 py-2 text-sm text-slate-400" role="status">{t("Searching…")}</div>}
              {!speciesPending && !placesPending && searchOpts.length === 0 && <div className="px-3 py-2 text-sm text-slate-400" role="status">{t("No species or places found")}</div>}
            </div>
          )}
        </div>
        <span className="hidden md:inline text-xs text-slate-400 tabular-nums">
          {status ? t("{d} detections · {s} species · {n} sensors", { d: fmtNum(status.detections, lang), s: status.species.toLocaleString(lang), n: status.sensors.toLocaleString(lang) }) : ""}
        </span>
        {/* Language: in the bar on wide screens; on phones it is in the About panel, so the search keeps its width. */}
        <select data-tour="lang" value={lang} onChange={(e) => { setLang(e.target.value as Lang); track("select_language", { lang: e.target.value }); }} aria-label={t("Language")} title={t("Language")}
          className={`max-md:hidden rounded-md bg-white/10 px-1.5 py-1 text-xs outline-none max-w-[6.5rem] ${FOCUS}`}>
          {LANGS.map((l) => <option key={l.code} value={l.code} className="text-slate-900">{l.label}</option>)}
        </select>
      </header>

      {/* Icon rail: a column on wide screens, a bottom tab bar on phones. Panels first, then (after a divider) links to pages. */}
      <nav data-tour="rail" aria-label={t("Map menu")} className="absolute left-0 top-11 bottom-0 w-[4.375rem] bg-black/80 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-2 gap-1 z-20 max-md:top-auto max-md:inset-x-0 max-md:w-full max-md:h-14 max-md:flex-row max-md:justify-around max-md:py-0 max-md:gap-0 max-md:border-r-0 max-md:border-t">
        <RailButton label={t("Now")} active={tab === "now" && !species} onClick={() => { setTab("now"); selectSpecies(null); setMoreOpen(false); }} icon={<path d="M3 12h4l3-8 4 16 3-8h4" />} />
        <RailButton label={t("Feed")} active={tab === "feed" && !species} onClick={() => { setTab("feed"); selectSpecies(null); setMoreOpen(false); }} icon={<><path d="M4 6h16M4 12h16M4 18h10" /></>} />
        {status?.ask && <RailButton label={t("Ask")} active={tab === "ask" && !species} onClick={() => { setTab("ask"); selectSpecies(null); setMoreOpen(false); }} icon={<><path d="M4 5h16v11H9l-5 4z" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4M12 15.5h.01" /></>} />}
        <RailButton label={t("About")} active={tab === "about" && !species} onClick={() => { setTab("about"); selectSpecies(null); setMoreOpen(false); }} icon={<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>} />
        <div className="md:hidden relative">
          <RailButton label={t("More")} active={moreOpen} onClick={() => setMoreOpen((v) => !v)} icon={<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>} expanded={moreOpen} />
        </div>
        <div className="w-10 h-px bg-white/15 my-1 max-md:hidden" role="separator" aria-hidden />
        <div className={`flex flex-col items-center gap-1 max-md:absolute max-md:bottom-full max-md:right-1 max-md:mb-1 max-md:w-48 max-md:items-stretch max-md:rounded-lg max-md:bg-slate-900 max-md:border max-md:border-white/15 max-md:shadow-2xl max-md:p-1 ${moreOpen ? "" : "max-md:hidden"}`}>
          <RailLink tour="contribute" href="/contribute" label={t("Add data")} icon={<><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></>} />
          <RailLink tour="research" href="/research" label={t("Research")} icon={<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" /><path d="M7.5 15h9" /></>} />
          <RailLink tour="report" href="/report" label={t("Report")} icon={<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />}
            onClick={(e) => { const m = mapRef.current; if (m && m.getZoom() >= 3) { e.preventDefault(); const c = m.getCenter(); router.push(`/report?lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}`); } }} />
          <RailLink tour="studio" href="/studio" label="Studio" title={t("Wildlife Network Studio: free desktop app")} icon={<><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4M12 7v5M9.5 9.5 12 12l2.5-2.5" /></>} />
          <RailLink tour="help" href="/help/site/map" label={t("Help")} title={t("Help and how-to guides")} icon={<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></>} />
          <RailLink href="/methods" label={t("Methods")} icon={<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>} />
        </div>
        <div className="flex-1 max-md:hidden" />
        <div className="max-md:hidden">
          <RailButton label={t("Hide")} active={false} onClick={() => { setTab(null); selectSpecies(null); }} icon={<path d="M15 6l-6 6 6 6" />} />
        </div>
      </nav>
      {/* Panel: a column beside the rail on wide screens; on phones a bottom sheet (45% peek, expandable) so the map stays visible. */}
      {panelOpen && (
        <aside aria-label={t("Panel")} className={`absolute left-[4.375rem] top-11 bottom-0 w-[24rem] max-w-[calc(100vw-4.375rem)] bg-slate-900/95 backdrop-blur-xl border-r border-white/10 flex flex-col z-10 max-md:left-0 max-md:right-0 max-md:top-auto max-md:bottom-14 max-md:w-full max-md:max-w-none max-md:border-r-0 max-md:border-t max-md:rounded-t-xl max-md:shadow-2xl ${sheetFull ? "max-md:h-[calc(100dvh-9rem)]" : "max-md:h-[45dvh]"}`}>
          <div className="md:hidden flex items-center shrink-0 h-7">
            <button onClick={() => setSheetFull((v) => !v)} aria-label={sheetFull ? t("Show more map") : t("Expand panel")} aria-expanded={sheetFull} className={`flex-1 h-full grid place-items-center ${FOCUS}`}>
              <span className="block w-10 h-1 rounded-full bg-slate-500" />
            </button>
            <button onClick={() => { setTab(null); selectSpecies(null); setSheetFull(false); }} aria-label={t("Close")} className={`w-9 h-full grid place-items-center text-slate-300 hover:text-white ${FOCUS}`}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          {status?.paused?.length ? <PausedNotice className="m-2 mb-0 shrink-0" /> : null}
          {species ? (
            <SpeciesPanel name={species} area={listenArea} near={listenNear} alerts={!!status?.alerts} onClose={() => selectSpecies(null)} />
          ) : tab === "place" && place ? (
            <PlacePanel place={place} group={group} onPick={pick} onClose={() => { setPlace(null); setTab("now"); }} />
          ) : tab === "now" && period ? (
            <HistoryPanel data={historyData} loading={!historyData} onPick={pick} onBack={() => setPeriod(null)} scopeLabel={scopeLabel} />
          ) : tab === "about" ? (
            <AboutPanel />
          ) : tab === "ask" ? (
            <AskPanel onPick={pick} city={home?.city ?? null} region={home ? regionOf(Math.floor(home.lat / 5) * 5, Math.floor(home.lon / 5) * 5) : null} />
          ) : tab === "feed" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-2 text-xs text-slate-400 border-b border-white/5" role="status">
                {failed ? (
                  <>{t("Could not load the latest detections.")} <button onClick={() => { setLiveFail(null); load(); }} className={`text-cyan-400 hover:underline rounded ${FOCUS}`}>{t("Try again")}</button></>
                ) : loading ? t("Loading latest detections") : t("Latest detections · {n} in the last {w}", { n: detections.toLocaleString(lang), w: liveHours < 24 ? liveHours + "h" : liveHours / 24 + "d" })}
              </div>
              {!loading && !failed && events.features.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">{t("No detections in this window yet.")}</p>}
              {events.features.slice(0, 200).map((f, i) => {
                const p = f.properties as Record<string, string>;
                return (
                  <div key={p.id ?? `m${i}`} className="flex items-center gap-3 min-h-[3.85rem] py-1 px-3 border-b border-white/5 hover:bg-white/5">
                    <button onClick={() => pick(p.sci)} className={`shrink-0 rounded-full ${FOCUS}`} tabIndex={-1} aria-hidden><Thumb src={thumbs[p.sci]} size={10} /></button>
                    <button onClick={() => pick(p.sci)} className={`min-w-0 flex-1 text-left rounded ${FOCUS}`}>
                      <div className="text-sm truncate">{p.common ?? p.sci}</div>
                      <div className="text-xs text-slate-400 truncate">{p.source}{Number(p.n) > 1 ? ` · ${t("{n} detections", { n: p.n })}` : ""}{p.conf != null && p.conf !== "" && Number.isFinite(Number(p.conf)) ? ` · conf ${Number(p.conf).toFixed(2)}` : ""}</div>
                    </button>
                    <span className="text-xs text-slate-300 tabular-nums shrink-0">{relTime(p.t, t)}</span>
                    <button onClick={() => flyTo(f)} aria-label={t("Jump to location")} className={`shrink-0 w-7 h-7 rounded hover:bg-white/10 text-slate-300 hover:text-white grid place-items-center ${FOCUS}`}>
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
              {home && (
                <p className="text-xs text-slate-300 -mb-1">
                  {areaWorld ? t("Lists show the whole world.") : home.city ? t("Lists show what is near {place}.", { place: home.city }) : t("Lists show what is near you.")}{" "}
                  <button className={`text-cyan-400 hover:underline rounded ${FOCUS}`} onClick={() => { const v = !areaWorld; setAreaWorld(v); try { localStorage.setItem("wn_area_world", v ? "1" : "0"); } catch { /* storage unavailable */ } }}>
                    {areaWorld ? t("Show near me") : t("Show worldwide")}
                  </button>
                </p>
              )}
              {group !== "all" && group !== "avian" && (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {group === "marine"
                    ? <>Marine records from OBIS, Orcasound hydrophones and Acartia sightings, measured against other marine records only. Killer whale records are shown 24 hours late, to protect endangered orcas.</>
                    : <>{CLASSES.find((c) => c.key === group)?.label} are measured against other {CLASSES.find((c) => c.key === group)?.label.toLowerCase()} only, from the stations able to detect them.</>}{" "}
                  {t("Coverage is thin, so treat these as early signals.")} <Link href="/methods#classes" className="text-cyan-500 hover:underline">{t("How this works")}</Link>.
                </p>
              )}
              {insights?.summary && insights.summary.length > 0 && (
                <section aria-label={t("This week in words")} className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">{t("This week in words")}</h3>
                  <ul className="space-y-1.5 text-[13px] leading-relaxed text-slate-200">
                    {insights.summary.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </section>
              )}
              {!!insights?.possible?.length && (
                <Section title={t("Possibly arriving")} hint={t("One strong recent week, not confirmed yet")} badge={scopeLabel(insights?.area?.scope.possible)}>
                  {insights.possible.map((a) => (
                    <Row key={a.scientificName} thumb={thumbs[a.scientificName]} onClick={() => pick(a.scientificName)} name={a.vernacularName ?? a.scientificName} sci={`${a.scientificName} · ${t(regionOf(a.cellLat, a.cellLon))}`}
                      value={weekLabel(a.week)} tone="neutral" />
                  ))}
                </Section>
              )}
              <Section title={t("Latest arrivals")} hint={t("Most recent arrival week, from the weekly history")} badge={scopeLabel(insights?.area?.scope.seasonal)}>
                {insights?.seasonal?.map((a) => (
                  <Row key={a.scientificName} thumb={thumbs[a.scientificName]} onClick={() => pick(a.scientificName)} name={a.vernacularName ?? a.scientificName} sci={`${a.scientificName} · ${t(regionOf(a.cellLat, a.cellLon))}`}
                    value={weekLabel(a.week)} tone="neutral" />
                ))}
              </Section>
              <Section title={t("Most recorded")} hint={t("Latest four weeks with data")} badge={scopeLabel(insights?.area?.scope.common)}>
                {insights?.common?.map((s) => (
                  <Row key={s.scientificName} thumb={thumbs[s.scientificName]} onClick={() => pick(s.scientificName)} name={s.vernacularName ?? s.scientificName} sci={s.scientificName} value={fmtNum(s.n, lang)} tone="neutral" />
                ))}
              </Section>
              <Section title={t("Moving")} hint={t("Range centre shift, 95% interval")}>
                {insights?.drift.map((d) => (
                  <Row key={d.scientificName + d.region} thumb={thumbs[d.scientificName]} onClick={() => pick(d.scientificName)} name={d.vernacularName ?? d.scientificName} sci={`${d.scientificName} · ${d.region}${d.driftLow != null && d.driftHigh != null ? ` · ${Math.abs(d.driftLow) < Math.abs(d.driftHigh) ? Math.abs(d.driftLow).toFixed(0) : Math.abs(d.driftHigh).toFixed(0)} to ${Math.max(Math.abs(d.driftLow), Math.abs(d.driftHigh)).toFixed(0)}°` : ""}`}
                    value={`${Math.abs(d.driftDeg).toFixed(1)}° ${d.driftDeg > 0 ? "N" : "S"}`} tone={d.driftDeg > 0 ? "warm" : "cool"} />
                ))}
              </Section>
              <Section title={t("Surging and fading")} hint={t("Yesterday vs 7 days, 95% interval")} badge={insights?.area ? t("Worldwide") : null}>
                {insights?.movers.map((m) => (
                  <Row key={m.scientificName} thumb={thumbs[m.scientificName]} onClick={() => pick(m.scientificName)} name={m.vernacularName ?? m.scientificName} sci={`${m.scientificName}${m.ratioLow != null && m.ratioHigh != null ? ` · ${m.ratio >= 1 ? "×" + m.ratioLow.toFixed(1) + " to ×" + m.ratioHigh.toFixed(1) : "÷" + (1 / m.ratioHigh).toFixed(1) + " to ÷" + (1 / m.ratioLow).toFixed(1)}` : ""}`}
                    value={`${m.ratio >= 1 ? "×" + m.ratio.toFixed(1) : "÷" + (1 / m.ratio).toFixed(1)}`} tone={m.ratio >= 1 ? "warm" : "cool"} />
                ))}
              </Section>
              {!!insights?.arrivals.length && (
              <Section title={t("New arrivals")} hint={t("First in 12 days, in a watched 5° cell")} badge={scopeLabel(insights?.area?.scope.arrivals)}>
                {insights?.arrivals.map((a) => (
                  <Row key={`${a.scientificName}${a.cellLat}${a.cellLon}`} thumb={thumbs[a.scientificName]} onClick={() => pick(a.scientificName)} name={a.vernacularName ?? a.scientificName} sci={a.scientificName}
                    value={t(regionOf(a.cellLat, a.cellLon))} tone="neutral" />
                ))}
              </Section>
              )}
              <Section title={t("Most detected")} hint={group === "bat" ? t("Last 24h") : t("Last {h}h", { h: hours })} badge={scopeLabel(speciesList.scope)}>
                {speciesList.list.slice(0, 15).map((s) => (
                  <Row key={s.scientificName} thumb={thumbs[s.scientificName]} onClick={() => pick(s.scientificName)} name={s.vernacularName ?? s.scientificName} sci={s.scientificName} value={fmtNum(s.count, lang)} tone="neutral" />
                ))}
              </Section>
            </div>
          )}
          <div className="px-4 py-2 border-t border-white/5 text-xs text-slate-300 flex flex-wrap gap-x-3 gap-y-1 max-md:hidden">
            <Legend color="#0891b2" label="BirdWeather" /><Legend color="#f59e0b" label="GBIF" /><Legend color="#65a30d" label="iNaturalist" /><Legend color="#db2777" label={t("Stations sending directly")} /><Legend color="#60a5fa" label="Acartia" /><Legend color="#2dd4bf" label="Orcasound" /><Legend color="#38bdf8" label="OBIS" />
            <span className="text-slate-400">{t("{n} sensors", { n: deployments.features.length.toLocaleString() })}</span>
          </div>
        </aside>
      )}

      {/* Map legend: says what the colours mean in the current mode */}
      {!legendOpen ? (
      <button onClick={() => setLegendOpen(true)} aria-expanded={false}
        className={`absolute top-14 right-14 max-md:top-[6.5rem] z-10 rounded-md bg-black/70 backdrop-blur-xl border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white ${FOCUS} ${panelOpen ? "max-md:hidden" : ""}`}>
        {t("Legend")}
      </button>
      ) : (
      <div className={`absolute top-14 right-14 max-md:top-[6.5rem] max-md:max-w-[calc(100vw-4.5rem)] z-10 rounded-md bg-black/70 backdrop-blur-xl border border-white/10 px-3 py-2 text-xs text-slate-300 ${panelOpen ? "max-md:hidden" : ""}`}>
        <button onClick={() => setLegendOpen(false)} aria-expanded={true} className={`float-right -mr-1 ml-2 text-slate-400 hover:text-white rounded ${FOCUS}`}>{t("Hide")}</button>
        {activeFrame ? (
          <>
            <div className="text-slate-400 mb-1">{t("Share of all detections that week")}</div>
            <div className="flex items-center gap-2"><span>{t("low")}</span><span className="h-2 w-24 rounded-sm" style={{ background: "linear-gradient(90deg, rgba(34,211,238,0.08), rgba(34,211,238,0.75))" }} /><span>{t("high")}</span></div>
            <div className="flex items-center gap-2 mt-1"><span className="inline-block w-5 h-0.5 bg-slate-100" /><span>{t("range centre, last 10 weeks")}</span></div>
          </>
        ) : species ? (
          <>
            <div className="text-slate-400 mb-1">{t("Change in share, 3 days vs week before")}</div>
            <div className="flex items-center gap-2"><span>{t("fading")}</span><span className="h-2 w-24 rounded-sm" style={{ background: "linear-gradient(90deg, #3b82f6, #64748b, #ea580c)" }} /><span>{t("surging")}</span></div>
          </>
        ) : (
          <>
            <div className="text-slate-400 mb-1" title="The newest detections from each source, refreshed every few minutes. Measures use full counts, not these dots.">{period ? (period === "12m" ? t("Last 12 months") : period === "30d" ? t("Last 30 days") : t("Last 7 days")) + " · " + t("species per area") : group === "bat" ? t("Bat detections, last 24h") : t("Detections, last {h}h (sample)", { h: hours })}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5"><Legend color="#0891b2" label="BirdWeather" /><Legend color="#f59e0b" label="GBIF" /><Legend color="#65a30d" label="iNaturalist" /><Legend color="#db2777" label={t("Devices")} /><Legend color="#60a5fa" label="Acartia" /><Legend color="#2dd4bf" label="Orcasound" /><Legend color="#38bdf8" label="OBIS" /><Legend color="#475569" label={t("Sensor")} /></div>
          </>
        )}
        {!species && (
          <div className="mt-1.5 pt-1.5 border-t border-white/10">
            <label className="flex items-center gap-1.5 cursor-pointer select-none" title="OBIS, Orcasound hydrophones and Acartia sightings, last 12 months">
              <input type="checkbox" checked={showMarine} onChange={(e) => { setShowMarine(e.target.checked); track("toggle_marine", { on: e.target.checked ? 1 : 0 }); }} className="accent-[#60a5fa]" />
              <span>{t("Marine records")}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={showCoverage} onChange={(e) => { setShowCoverage(e.target.checked); if (e.target.checked) track("show_coverage"); }} className="accent-[#a78bfa]" />
              <span>{t("Coverage")}</span>
            </label>
            {showCoverage && (
              <div className="mt-1 space-y-0.5">
                <Legend color="#a78bfa" label={`${t("Recordings and sightings")}${coverage ? ` (${coverage.summary.both})` : ""}`} />
                <Legend color="#22d3ee" label={`${t("Recordings only")}${coverage ? ` (${coverage.summary.acoustic})` : ""}`} />
                <Legend color="#f59e0b" label={`${t("Sightings only")}${coverage ? ` (${coverage.summary.observed})` : ""}`} />
                <Legend color="#64748b" label={t("Too thin to use")} />
                <Link href="/methods#coverage" className="block text-cyan-500 hover:underline">{t("What counts as watched")}</Link>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Time slider */}
      {/* Phones: full width with side gutters, above the bottom bar and the map attribution. */}
      {quietNear && !period && !species && (
        <div role="status" className={`absolute left-2 right-2 max-md:top-[5.75rem] md:bottom-[6.25rem] ${panelOpen ? "md:left-[30rem]" : "md:left-24"} md:right-auto z-10 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-sm text-slate-200 backdrop-blur-xl`}>
          <span>{t(quietNear === "here" ? "Nothing recorded here in the last few hours." : "Nothing recorded near you in the last few hours.")}</span>
          <button onClick={() => { setPeriod("7d"); setQuietNear(null); setPlayhead(null); setPlaying(false); setTab("now"); track("select_period", { period: "7d" }); }} className={`rounded bg-cyan-500 px-2.5 py-1 text-xs font-medium text-slate-950 hover:bg-cyan-400 ${FOCUS}`}>{t("Show the last 7 days")}</button>
          <button onClick={() => setQuietNear(null)} aria-label={t("Close")} className={`ml-auto rounded px-1.5 text-slate-400 hover:text-slate-200 ${FOCUS}`}>×</button>
        </div>
      )}
      <div data-tour="slider" className={`absolute right-2 md:right-6 bottom-[7rem] md:bottom-9 left-2 ${panelOpen ? "max-md:hidden md:left-[30rem]" : "md:left-24"} h-[3.75rem] rounded-lg bg-black/70 backdrop-blur-xl border border-white/10 px-3 md:px-4 flex items-center gap-2 md:gap-3 z-10 transition-[left]`}>
        {species ? (
          <>
            <span className="text-xs uppercase tracking-wider text-slate-300 shrink-0 whitespace-nowrap">{activeFrame ? new Date(activeFrame.week).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }) : t("Movement")}</span>
            <button disabled={frames.length === 0} onClick={() => { if (!mvPlaying) track("play_year", { species: species ?? "" }); setMvPlaying((p) => !p); if (frame === null) setFrame(0); }} className={`rounded bg-[#006cd9] hover:bg-[#2b84e6] disabled:opacity-40 text-sm px-3 py-1 font-medium whitespace-nowrap shrink-0 ${FOCUS}`}>
              {mvPlaying ? t("Pause") : t("Play year")}
            </button>
            <input type="range" min={0} max={Math.max(0, frames.length - 1)} aria-label={t("Week")} step={1} value={frame ?? Math.max(0, frames.length - 1)} disabled={frames.length === 0}
              onChange={(e) => { setMvPlaying(false); setFrame(Number(e.target.value)); }} className="flex-1 min-w-0 accent-[#006cd9]" />
            <button onClick={() => { setMvPlaying(false); setFrame(null); }} className={`text-xs text-slate-300 hover:text-white rounded ${FOCUS}`}>{t("Live")}</button>
            <span className="text-xs text-slate-300 tabular-nums whitespace-nowrap text-right hidden lg:inline">
              {frames.length === 0 ? t("No weekly history yet") : activeFrame ? t("Week of {d} · {v} per 1,000", { d: new Date(activeFrame.week).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" }), v: activeFrame.index.toFixed(1) }) : t("{n} weeks available", { n: frames.length })}
            </span>
          </>
        ) : (
          <>
        <div className="flex gap-1 max-md:gap-0.5 shrink-0">
          {HOURS.map((h) => (
            <button key={h} onClick={() => { setHours(h); setPeriod(null); setQuietNear(null); setPlayhead(null); setPlaying(false); }}
              className={`text-xs rounded px-2 py-1 ${FOCUS} ${h === hours && !period ? "bg-white/90 text-slate-900 font-medium" : "bg-white/10 hover:bg-white/20"}`}>
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
          <span className="w-px bg-white/15 mx-0.5" aria-hidden />
          {PERIODS.map((p) => (
            <button key={p} onClick={() => { setPeriod(p); setPlayhead(null); setPlaying(false); setTab("now"); track("select_period", { period: p }); }} title={t(p === "7d" ? "Last 7 days" : p === "30d" ? "Last 30 days" : "Last 12 months")}
              className={`text-xs rounded px-2 py-1 ${FOCUS} ${p === period ? "bg-white/90 text-slate-900 font-medium" : "bg-white/10 hover:bg-white/20"}`}>
              {p}
            </button>
          ))}
        </div>
        {period ? (
          <span className="flex-1 min-w-0 text-xs text-slate-300 truncate">
            {historyData ? t("{r} records of {s} species", { r: fmtNum(historyData.records, lang, true), s: historyData.species.toLocaleString(lang) }) : t("Loading")}
          </span>
        ) : (<>
        <button onClick={() => { setPlaying((p) => !p); if (playhead === null) setPlayhead(0); }} className={`rounded bg-[#006cd9] hover:bg-[#2b84e6] text-sm px-3 py-1 font-medium ${FOCUS}`}>
          {playing ? t("Pause") : t("Play")}
        </button>
        <input type="range" min={0} max={total} step={total / 600} value={playhead ?? total}
          onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }} className="flex-1 min-w-0 accent-[#006cd9]" />
        <button onClick={() => { setPlaying(false); setPlayhead(null); }} className={`text-xs text-slate-300 hover:text-white rounded ${FOCUS}`}>{t("All")}</button>
        <span className="text-xs text-slate-300 tabular-nums w-40 text-right hidden sm:inline">
          {failed ? t("Could not load") : loading ? t("Loading") : playhead === null ? t("{n} detections", { n: detections.toLocaleString(lang) }) : new Date(windowStart + playhead).toLocaleString(lang)}
        </span>
        </>)}
          </>
        )}
      </div>

      <Tour key={tour ?? "closed"} open={tour !== null} auto={tour === "auto"} askEnabled={!!status?.ask} onClose={() => setTour(null)} />
    </div>
  );
}

function relTime(iso: string, t: (text: string, vars?: Record<string, string | number>) => string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return t("{n}s ago", { n: Math.round(s) });
  if (s < 3600) return t("{n}m ago", { n: Math.round(s / 60) });
  if (s < 86400) return t("{n}h ago", { n: Math.round(s / 3600) });
  return t("{n}d ago", { n: Math.round(s / 86400) });
}

const RAIL_ITEM = `w-14 h-14 rounded-md flex flex-col items-center justify-center gap-1 text-[11px] leading-tight ${FOCUS}`;

function RailButton({ label, active, onClick, icon, expanded }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode; expanded?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={expanded === undefined ? active : undefined} aria-expanded={expanded} className={`${RAIL_ITEM} max-md:w-16 ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
      {label}
    </button>
  );
}

/** A rail entry that opens another page: marked with a small arrow so it reads differently from the panel buttons. */
function RailLink({ href, label, icon, tour, title, onClick }: { href: string; label: string; icon: React.ReactNode; tour?: string; title?: string; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link data-tour={tour} href={href} title={title} onClick={onClick}
      className={`${RAIL_ITEM} relative text-slate-300 hover:bg-white/5 hover:text-white max-md:w-full max-md:h-11 max-md:flex-row max-md:justify-start max-md:gap-3 max-md:px-3 max-md:text-sm`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
      {label}
      <svg viewBox="0 0 24 24" className="absolute top-1 right-1 w-2.5 h-2.5 text-slate-400 max-md:static max-md:ml-auto max-md:w-3 max-md:h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>
    </Link>
  );
}

function Thumb({ src, size }: { src?: string | null; size: 6 | 8 | 10 }) {
  const cls = size === 6 ? "w-6 h-6" : size === 8 ? "w-8 h-8" : "w-10 h-10";
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={`${cls} rounded-full object-cover shrink-0 bg-slate-800`} loading="lazy" /> : <span className={`${cls} rounded-full bg-slate-800 shrink-0 inline-block`} />;
}

function Section({ title, hint, badge, children }: { title: string; hint: string; badge?: string | null; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">{title}{badge && <span className="ml-1.5 normal-case tracking-normal font-normal text-xs text-cyan-400">{badge}</span>}</h3>
        <span className="text-xs text-slate-400 text-right">{hint}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({ name, sci, value, tone, onClick, thumb }: { name: string; sci: string; value: string; tone: "warm" | "cool" | "neutral"; onClick: () => void; thumb?: string | null }) {
  const toneCls = tone === "warm" ? "text-[#E76826]" : tone === "cool" ? "text-[#4d9ffc]" : "text-slate-200";
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-2 py-1 -mx-2 rounded hover:bg-white/5 text-left ${FOCUS}`}>
      <Thumb src={thumb} size={8} />
      <span className="min-w-0 flex-1"><span className="text-sm block truncate">{name}</span><span className="text-xs text-slate-400 italic block truncate">{sci}</span></span>
      <span className={`text-xs tabular-nums shrink-0 ${toneCls}`}>{value}</span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: color }} />{label}</span>;
}
