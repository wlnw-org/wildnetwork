"use client";

import PausedNotice from "@/components/PausedNotice";
import Link from "next/link";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ICON_IMAGE, registerIcons } from "@/lib/mapIcons";
import AboutPanel from "./AboutPanel";
import AskPanel from "./AskPanel";
import { track } from "./Analytics";
import SpeciesPanel, { type SpeciesDetail } from "./SpeciesPanel";
import PlacePanel, { type PickedPlace } from "./PlacePanel";
import HistoryPanel, { type History, type Period } from "./HistoryPanel";
import { areaFor, type XcArea } from "@/lib/xenocanto";
import Tour, { TOUR_KEY } from "./Tour";
import { LANGS, setLang, useLang, useT, type Lang } from "@/lib/i18n";


type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
interface Species { scientificName: string; vernacularName: string | null; count: number; deployments: number }
interface Insights {
  summary?: string[];
  coverage: { from: string; to: string; species: number; detections: number };
  movers: { scientificName: string; vernacularName: string | null; yesterday: number; avg7: number; ratio: number; ratioLow?: number | null; ratioHigh?: number | null }[];
  drift: { scientificName: string; vernacularName: string | null; region: string; driftDeg: number; latNow: number; n: number; driftLow?: number | null; driftHigh?: number | null }[];
  arrivals: { scientificName: string; vernacularName: string | null; cellLat: number; cellLon: number; n: number }[];
  seasonal?: { scientificName: string; vernacularName: string | null; cellLat: number; cellLon: number; week: string; n: number }[];
  common?: { scientificName: string; vernacularName: string | null; n: number; cells: number }[];
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

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export default function WorldMap() {
  const t = useT();
  const lang = useLang();
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hours, setHours] = useState(3);
  const [period, setPeriod] = useState<Period | null>(null);
  const [history, setHistory] = useState<{ key: string; data: History } | null>(null);
  const [species, setSpecies] = useState<string | null>(null);
  // Continent in view when a species is picked: Listen prefers recordings from there. Only this name is sent, never coordinates.
  const [listenArea, setListenArea] = useState<XcArea | null>(null);
  // Map centre rounded to whole degrees (about 100 km): enough to pick the country for Listen, never finer.
  const [listenNear, setListenNear] = useState<string | null>(null);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<FC>(EMPTY);
  const [sightings, setSightings] = useState<FC>(EMPTY);
  // Off on first load (the legend toggle turns it on); choosing the Marine class or a species shows its records regardless.
  const [showMarine, setShowMarine] = useState(false);
  const [deployments, setDeployments] = useState<FC>(EMPTY);
  const [cells, setCells] = useState<FC>(EMPTY);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [tab, setTab] = useState<"now" | "feed" | "ask" | "about" | "place" | null>("now");
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [placeHits, setPlaceHits] = useState<(PickedPlace & { key: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("all");
  const [results, setResults] = useState<Species[]>([]);
  // Search has its own debounced request, so typing does not reload the map.
  useEffect(() => {
    if (query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/v1/species?q=${encodeURIComponent(query.trim())}`).then((r) => r.json()).then((d: Species[]) => { if (!cancelled) setResults(d); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);
  const [status, setStatus] = useState<Status | null>(null);
  const [coverage, setCoverage] = useState<{ summary: Record<string, number>; cells: { lat: number; lon: number; status: string; acoustic: number; observed: number }[] } | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [frame, setFrame] = useState<number | null>(null); // index into movement.frames; null = live view
  const [mvPlaying, setMvPlaying] = useState(false);

  const thumbsRef = useRef<Record<string, string | null>>({});
  // Merged BirdWeather points carry a count n, so totals add those up rather than counting points.
  const detections = useMemo(() => events.features.reduce((t, f) => t + (Number(f.properties?.n) || 1), 0), [events]);
  const liveHours = group === "bat" && !species ? 24 : hours; // the bat layer covers a day
  const windowStart = useMemo(() => fetchedAt - liveHours * 3600_000, [fetchedAt, liveHours]);

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
    } else if (!qs.has("species")) {
      fetch("/api/v1/near").then((r) => r.json() as Promise<{ lat?: number; lon?: number }>).then((n) => {
        if (cancelled || n.lat == null || n.lon == null) return;
        map.easeTo({ center: [n.lon, n.lat], zoom: 4, duration: 1800, padding: { top: 0, bottom: 0, right: 0, left: window.innerWidth >= 768 ? 420 : 0 } });
      }).catch(() => {});
    }
    map.on("load", () => {
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
      registerIcons(map).then(() => {
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
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const current = () => seq === loadSeq.current;
    const windowHours = group === "bat" && !species ? 24 : hours; // bats are sparse and nocturnal, so their live window is a day
    const from = new Date(Math.floor((Date.now() - windowHours * 3600_000) / 300_000) * 300_000).toISOString(); // 5 minute steps, cacheable
    const u = new URLSearchParams({ from, limit: "20000", merge: "1" });
    if (species) u.set("species", species);
    else if (group !== "all") u.set("group", group);
    const gq = group !== "all" ? `group=${group}` : "";
    const wantThumbs = (names: string[]) => {
      const missing = [...new Set(names)].filter((n) => n && n !== "null" && !(n in thumbsRef.current)).slice(0, 40);
      if (!missing.length) return;
      for (const n of missing) thumbsRef.current[n] = null; // claimed, so parallel calls do not refetch
      fetch(`/api/v1/media?names=${encodeURIComponent(missing.join(","))}`).then((r) => r.json()).then((m: Record<string, { thumbUrl: string | null }>) => {
        setThumbs((t) => { const next = { ...t }; for (const n of missing) next[n] = m[n]?.thumbUrl ?? null; thumbsRef.current = { ...thumbsRef.current, ...next }; return next; });
      }).catch(() => {});
    };
    const events = fetch(`/api/v1/events?${u}`).then((r) => r.json() as Promise<FC>).then((ev) => {
      if (!current()) return;
      setEvents(ev); setFetchedAt(Date.now()); setLoading(false);
      wantThumbs(ev.features.slice(0, 40).map((f) => String(f.properties.sci)));
    });
    const rest = [
      fetch(`/api/v1/species?hours=${group === "marine" ? MARINE_DAYS * 24 : group === "bat" ? 24 : hours}${gq ? "&" + gq : ""}`).then((r) => r.json() as Promise<Species[]>).then((sp) => { if (!current()) return; setSpeciesList(sp); wantThumbs(sp.slice(0, 15).map((x) => x.scientificName)); }),
      fetch(`/api/v1/insights${gq ? "?" + gq : ""}`).then((r) => r.json() as Promise<Insights>).then((ins) => { if (!current()) return; setInsights(ins); wantThumbs([...(ins.seasonal ?? []), ...(ins.common ?? []), ...ins.drift, ...ins.movers, ...ins.arrivals].map((x) => x.scientificName)); }),
      fetch(`/api/v1/status`).then((r) => r.json() as Promise<Status>).then(setStatus),
    ];
    await Promise.allSettled([events, ...rest]);
  }, [hours, species, group]);

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
        mapRef.current.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons) + 5, Math.max(...lats) + 5]], { padding: { top: 60, bottom: 90, left: 480, right: 40 }, maxZoom: 5, duration: 1200 });
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
    fetch(`/api/v1/history?period=${period}&group=${group}`).then((r) => r.json() as Promise<History>)
      .then((d) => { if (!off) setHistory({ key: `${period}|${group}`, data: d }); }).catch(() => {});
    return () => { off = true; };
  }, [period, group]);
  const historyData = history && history.key === historyKey ? history.data : null;
  const historyFC = useMemo<FC>(() => {
    if (!historyData?.cells.length) return EMPTY;
    const max = Math.log10(Math.max(...historyData.cells.map((c) => c.n)) + 1);
    return { type: "FeatureCollection", features: historyData.cells.map((c) => ({
      type: "Feature", properties: { share: Math.log10(c.n + 1) / max, n: c.n },
      geometry: { type: "Polygon", coordinates: [[[c.lon, c.lat], [c.lon + 5, c.lat], [c.lon + 5, c.lat + 5], [c.lon, c.lat + 5], [c.lon, c.lat]]] },
    })) } as FC;
  }, [historyData]);

  const shareScale = useMemo(() => {
    const all = frames.flatMap((f) => f.cells.map((c) => c[3])).sort((a, b) => a - b);
    return all.length ? Math.max(all[Math.floor(all.length * 0.95)], 1e-6) : 1;
  }, [frames]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const weekSrc = map.getSource("week-cells") as GeoJSONSource, trackSrc = map.getSource("track") as GeoJSONSource;
    if (activeFrame) {
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
      weekSrc?.setData(historyFC); trackSrc?.setData(EMPTY);
      (map.getSource("cells") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("events") as GeoJSONSource)?.setData(EMPTY);
      (map.getSource("deployments") as GeoJSONSource)?.setData(deployments);
      return;
    }
    weekSrc?.setData(EMPTY); trackSrc?.setData(EMPTY);
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
  }, [events, sightings, deployments, cells, species, playhead, ready, windowStart, liveHours, activeFrame, frames, frame, shareScale, period, historyFC]);

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
    map.easeTo({ padding: { left: wide ? (panelOpenNow ? 454 : 70) : 0, top: 44, bottom: 100, right: 0 }, duration: 300 });
  }, [panelOpenNow, ready]);

  // 8: on a phone the panel covers the map, so start with it closed.
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
    setSpecies(name); setPlayhead(null); setPlaying(false); setFrame(null); setMvPlaying(false);
    setEvents(EMPTY); setLoading(true);
  };
  const pick = (name: string) => { selectSpecies(name); setTab("now"); track("select_species", { species: name }); };

  // First-visit walkthrough: opens once the map is ready, unless the visitor came for a species or has seen it. The About panel can replay it.
  const [tour, setTour] = useState<"auto" | "manual" | null>(null);
  useEffect(() => {
    const replay = () => setTour("manual");
    window.addEventListener("wn:tour", replay);
    return () => window.removeEventListener("wn:tour", replay);
  }, []);
  useEffect(() => {
    if (!ready) return;
    let seen = true;
    try { seen = localStorage.getItem(TOUR_KEY) === "done"; } catch {}
    if (seen || new URLSearchParams(window.location.search).has("species")) return;
    const t = setTimeout(() => setTour("auto"), 1500);
    return () => clearTimeout(t);
  }, [ready]);
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
    if (q.length < 3) { const id = setTimeout(() => setPlaceHits([]), 0); return () => clearTimeout(id); }
    let off = false;
    const id = setTimeout(() => {
      fetch(`/api/v1/places?q=${encodeURIComponent(q)}`).then((r) => r.json() as Promise<{ places: { name: string; admin1: string | null; country: string | null; lat: number; lon: number; slug: string }[] }>)
        .then((d) => { if (!off) setPlaceHits(d.places.slice(0, 5).map((p) => ({ key: `${p.slug}${p.lat}`, slug: p.slug, lat: p.lat, lon: p.lon, label: [p.name, p.admin1, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") }))); })
        .catch(() => {});
    }, 350);
    return () => { off = true; clearTimeout(id); };
  }, [query]);
  const goPlace = (p: PickedPlace) => {
    selectSpecies(null); setPlace(p); setTab("place"); setQuery("");
    mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 7, duration: 1200 });
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="w-6 h-6 rounded-md" />
        <span className="font-semibold tracking-tight">Wildlife Network</span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className={`inline-block w-2 h-2 rounded-full ${status?.live ? "bg-[#7fd320]" : "bg-[#d0031b]"}`} />
          {status?.live ? t("Live") : t("Stale")}{status?.lastPullAt && <span className="hidden sm:inline"> · {t("updated {t}", { t: relTime(status.lastPullAt, t) })}</span>}
        </span>
        <div className="flex-1" />
        <div data-tour="classes" className="hidden lg:flex items-center gap-1" role="group" aria-label={t("Animal class")}>
          {CLASSES.map((c) => (
            <button key={c.key} onClick={() => { track("select_class", { class: c.key }); setGroup(c.key); selectSpecies(null); if (tab === null) setTab("now"); }}
              className={`text-xs rounded px-2 py-1 ${group === c.key ? "bg-white/90 text-slate-900 font-medium" : "text-slate-300 hover:bg-white/10"}`}>
              {t(c.label)}
            </button>
          ))}
        </div>
        <select data-tour="classes" value={group} onChange={(e) => { setGroup(e.target.value); selectSpecies(null); }} aria-label={t("Animal class")}
          className="lg:hidden rounded-md bg-white/10 px-2 py-1 text-sm outline-none">
          {CLASSES.map((c) => <option key={c.key} value={c.key} className="text-slate-900">{t(c.label)}</option>)}
        </select>
        <div data-tour="search" className="relative w-64 max-w-[40vw]">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search a species or place")}
            className="w-full rounded-md bg-white/10 px-2.5 py-1 text-sm outline-none focus:bg-white/15 placeholder:text-slate-500" />
          {query.trim().length >= 2 && (
            <div className="absolute top-full mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-md bg-slate-900 border border-slate-700 shadow-xl">
              {placeHits.length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500">{t("Places")}</div>}
              {placeHits.map((p) => (
                <button key={p.key} onClick={() => goPlace(p)} className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-sm flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></svg>
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
              {placeHits.length > 0 && results.length > 0 && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500">{t("Species")}</div>}
              {results.length === 0 && placeHits.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">{t("No species found")}</div>}
              {results.slice(0, 20).map((s) => (
                <button key={s.scientificName} onClick={() => { pick(s.scientificName); setQuery(""); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-sm flex items-center gap-2">
                  <Thumb src={thumbs[s.scientificName]} size={6} />
                  <span className="truncate">{s.vernacularName ?? s.scientificName}</span>
                  <span className="text-slate-500 text-xs italic truncate">{s.scientificName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="hidden md:inline text-[11px] text-slate-500 tabular-nums">
          {status ? t("{d} detections · {s} species · {n} sensors", { d: status.detections.toLocaleString(), s: status.species.toLocaleString(), n: status.sensors.toLocaleString() }) : ""}
        </span>
        <select value={lang} onChange={(e) => { setLang(e.target.value as Lang); track("select_language", { lang: e.target.value }); }} aria-label={t("Language")} title={t("Language")}
          className="rounded-md bg-white/10 px-1.5 py-1 text-xs outline-none max-w-[6.5rem]">
          {LANGS.map((l) => <option key={l.code} value={l.code} className="text-slate-900">{l.label}</option>)}
        </select>
      </header>

      {/* Icon rail */}
      <nav data-tour="rail" className="absolute left-0 top-11 bottom-0 w-[4.375rem] bg-black/80 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-2 gap-1 z-20">
        <RailButton label={t("Now")} active={tab === "now" && !species} onClick={() => { setTab("now"); selectSpecies(null); }} icon={<path d="M3 12h4l3-8 4 16 3-8h4" />} />
        <RailButton label={t("Feed")} active={tab === "feed" && !species} onClick={() => { setTab("feed"); selectSpecies(null); }} icon={<><path d="M4 6h16M4 12h16M4 18h10" /></>} />
        {status?.ask && <RailButton label={t("Ask")} active={tab === "ask" && !species} onClick={() => { setTab("ask"); selectSpecies(null); }} icon={<><path d="M4 5h16v11H9l-5 4z" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4M12 15.5h.01" /></>} />}
        <RailButton label={t("About")} active={tab === "about" && !species} onClick={() => { setTab("about"); selectSpecies(null); }} icon={<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>} />
        <Link data-tour="contribute" href="/contribute" className="w-14 h-14 rounded-md flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 hover:bg-white/5 hover:text-slate-200">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></svg>
          {t("Add data")}
        </Link>
        <Link href="/research" className="w-14 h-14 rounded-md flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 hover:bg-white/5 hover:text-slate-200">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" /><path d="M7.5 15h9" /></svg>
          {t("Research")}
        </Link>
        <Link href="/methods" className="w-14 h-14 rounded-md flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 hover:bg-white/5 hover:text-slate-200">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
          {t("Methods")}
        </Link>
        <div className="flex-1" />
        <RailButton label={t("Hide")} active={false} onClick={() => { setTab(null); selectSpecies(null); }} icon={<path d="M15 6l-6 6 6 6" />} />
      </nav>

      {/* Panel */}
      {panelOpen && (
        <aside className="absolute left-[4.375rem] top-11 bottom-0 w-[24rem] max-w-[calc(100vw-4.375rem)] bg-slate-900/95 backdrop-blur-xl border-r border-white/10 flex flex-col z-10">
          {status?.paused?.length ? <PausedNotice className="m-2 mb-0 shrink-0" /> : null}
          {species ? (
            <SpeciesPanel name={species} area={listenArea} near={listenNear} alerts={!!status?.alerts} onClose={() => selectSpecies(null)} />
          ) : tab === "place" && place ? (
            <PlacePanel place={place} group={group} onPick={pick} onClose={() => { setPlace(null); setTab("now"); }} />
          ) : tab === "now" && period ? (
            <HistoryPanel data={historyData} loading={!historyData} onPick={pick} onBack={() => setPeriod(null)} />
          ) : tab === "about" ? (
            <AboutPanel />
          ) : tab === "ask" ? (
            <AskPanel onPick={pick} />
          ) : tab === "feed" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-2 text-[11px] text-slate-500 border-b border-white/5">{loading ? t("Loading latest detections") : t("Latest detections · {n} in the last {w}", { n: detections.toLocaleString(), w: hours < 24 ? hours + "h" : hours / 24 + "d" })}</div>
              {events.features.slice(0, 200).map((f, i) => {
                const p = f.properties as Record<string, string>;
                return (
                  <div key={p.id ?? `m${i}`} className="flex items-center gap-3 h-[3.85rem] px-3 border-b border-white/5 hover:bg-white/5">
                    <button onClick={() => pick(p.sci)} className="shrink-0"><Thumb src={thumbs[p.sci]} size={10} /></button>
                    <button onClick={() => pick(p.sci)} className="min-w-0 flex-1 text-left">
                      <div className="text-sm truncate">{p.common ?? p.sci}</div>
                      <div className="text-[11px] text-slate-500 truncate">{p.source}{Number(p.n) > 1 ? ` · ${t("{n} detections", { n: p.n })}` : ""} · conf {Number(p.conf).toFixed(2)}</div>
                    </button>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{relTime(p.t, t)}</span>
                    <button onClick={() => flyTo(f)} aria-label={t("Jump to location")} className="shrink-0 w-7 h-7 rounded hover:bg-white/10 text-slate-400 hover:text-white grid place-items-center">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
              {group !== "all" && group !== "avian" && (
                <p className="text-xs text-slate-400 leading-relaxed">
                  {group === "marine"
                    ? <>Marine records from OBIS, Orcasound hydrophones and Acartia sightings, measured against other marine records only. Killer whale records are shown 24 hours late, to protect endangered orcas.</>
                    : <>{CLASSES.find((c) => c.key === group)?.label} are measured against other {CLASSES.find((c) => c.key === group)?.label.toLowerCase()} only, from the stations able to detect them.</>}{" "}
                  {t("Coverage is thin, so treat these as early signals.")} <Link href="/methods#classes" className="text-cyan-500 hover:underline">{t("How this works")}</Link>.
                </p>
              )}
              {insights?.summary && insights.summary.length > 0 && (
                <section aria-label={t("This week in words")} className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("This week in words")}</h3>
                  <ul className="space-y-1.5 text-[13px] leading-relaxed text-slate-200">
                    {insights.summary.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </section>
              )}
              <Section title={t("Latest arrivals")} hint={t("Most recent arrival week, from the weekly history")}>
                {insights?.seasonal?.map((a) => (
                  <Row key={a.scientificName} thumb={thumbs[a.scientificName]} onClick={() => pick(a.scientificName)} name={a.vernacularName ?? a.scientificName} sci={`${a.scientificName} · ${a.cellLat}°, ${a.cellLon}°`}
                    value={new Date(a.week + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} tone="neutral" />
                ))}
              </Section>
              <Section title={t("Most recorded")} hint={t("Latest four weeks with data")}>
                {insights?.common?.map((s) => (
                  <Row key={s.scientificName} thumb={thumbs[s.scientificName]} onClick={() => pick(s.scientificName)} name={s.vernacularName ?? s.scientificName} sci={s.scientificName} value={s.n.toLocaleString()} tone="neutral" />
                ))}
              </Section>
              <Section title={t("Moving")} hint={t("Range centre shift, 95% interval")}>
                {insights?.drift.map((d) => (
                  <Row key={d.scientificName + d.region} thumb={thumbs[d.scientificName]} onClick={() => pick(d.scientificName)} name={d.vernacularName ?? d.scientificName} sci={`${d.scientificName} · ${d.region}${d.driftLow != null && d.driftHigh != null ? ` · ${Math.abs(d.driftLow) < Math.abs(d.driftHigh) ? Math.abs(d.driftLow).toFixed(0) : Math.abs(d.driftHigh).toFixed(0)} to ${Math.max(Math.abs(d.driftLow), Math.abs(d.driftHigh)).toFixed(0)}°` : ""}`}
                    value={`${Math.abs(d.driftDeg).toFixed(1)}° ${d.driftDeg > 0 ? "N" : "S"}`} tone={d.driftDeg > 0 ? "warm" : "cool"} />
                ))}
              </Section>
              <Section title={t("Surging and fading")} hint={t("Yesterday vs 7 days, 95% interval")}>
                {insights?.movers.map((m) => (
                  <Row key={m.scientificName} thumb={thumbs[m.scientificName]} onClick={() => pick(m.scientificName)} name={m.vernacularName ?? m.scientificName} sci={`${m.scientificName}${m.ratioLow != null && m.ratioHigh != null ? ` · ${m.ratio >= 1 ? "×" + m.ratioLow.toFixed(1) + " to ×" + m.ratioHigh.toFixed(1) : "÷" + (1 / m.ratioHigh).toFixed(1) + " to ÷" + (1 / m.ratioLow).toFixed(1)}` : ""}`}
                    value={`${m.ratio >= 1 ? "×" + m.ratio.toFixed(1) : "÷" + (1 / m.ratio).toFixed(1)}`} tone={m.ratio >= 1 ? "warm" : "cool"} />
                ))}
              </Section>
              <Section title={t("New arrivals")} hint={t("First in 12 days, in a watched 5° cell")}>
                {insights?.arrivals.map((a) => (
                  <Row key={`${a.scientificName}${a.cellLat}${a.cellLon}`} thumb={thumbs[a.scientificName]} onClick={() => pick(a.scientificName)} name={a.vernacularName ?? a.scientificName} sci={a.scientificName}
                    value={`${a.cellLat}°, ${a.cellLon}°`} tone="neutral" />
                ))}
              </Section>
              <Section title={t("Most detected")} hint={group === "bat" ? t("Last 24h") : t("Last {h}h", { h: hours })}>
                {speciesList.slice(0, 15).map((s) => (
                  <Row key={s.scientificName} thumb={thumbs[s.scientificName]} onClick={() => pick(s.scientificName)} name={s.vernacularName ?? s.scientificName} sci={s.scientificName} value={s.count.toLocaleString()} tone="neutral" />
                ))}
              </Section>
            </div>
          )}
          <div className="px-4 py-2 border-t border-white/5 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <Legend color="#0891b2" label="BirdWeather" /><Legend color="#f59e0b" label="GBIF" /><Legend color="#65a30d" label="iNaturalist" /><Legend color="#db2777" label={t("WDX devices")} /><Legend color="#60a5fa" label="Acartia" /><Legend color="#2dd4bf" label="Orcasound" /><Legend color="#38bdf8" label="OBIS" />
            <span className="text-slate-500">{t("{n} sensors", { n: deployments.features.length.toLocaleString() })}</span>
          </div>
        </aside>
      )}

      {/* Map legend: says what the colours mean in the current mode */}
      <div className={`absolute top-14 right-14 z-10 rounded-md bg-black/70 backdrop-blur-xl border border-white/10 px-3 py-2 text-[11px] text-slate-300 ${panelOpen ? "max-md:hidden" : ""}`}>
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
            <div className="text-slate-400 mb-1" title="The newest detections from each source, refreshed every few minutes. Measures use full counts, not these dots.">{group === "bat" ? t("Bat detections, last 24h") : t("Detections, last {h}h (sample)", { h: hours })}</div>
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

      {/* Time slider */}
      <div data-tour="slider" className={`absolute right-3 md:right-6 bottom-9 left-[5.25rem] ${panelOpen ? "max-md:hidden md:left-[30rem]" : "md:left-24"} h-[3.75rem] rounded-lg bg-black/70 backdrop-blur-xl border border-white/10 px-4 flex items-center gap-3 z-10 transition-[left]`}>
        {species ? (
          <>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 shrink-0 whitespace-nowrap">{activeFrame ? new Date(activeFrame.week).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }) : t("Movement")}</span>
            <button disabled={frames.length === 0} onClick={() => { if (!mvPlaying) track("play_year", { species: species ?? "" }); setMvPlaying((p) => !p); if (frame === null) setFrame(0); }} className="rounded bg-[#006cd9] hover:bg-[#2b84e6] disabled:opacity-40 text-sm px-3 py-1 font-medium whitespace-nowrap shrink-0">
              {mvPlaying ? t("Pause") : t("Play year")}
            </button>
            <input type="range" min={0} max={Math.max(0, frames.length - 1)} aria-label={t("Week")} step={1} value={frame ?? Math.max(0, frames.length - 1)} disabled={frames.length === 0}
              onChange={(e) => { setMvPlaying(false); setFrame(Number(e.target.value)); }} className="flex-1 min-w-0 accent-[#006cd9]" />
            <button onClick={() => { setMvPlaying(false); setFrame(null); }} className="text-xs text-slate-400 hover:text-white">{t("Live")}</button>
            <span className="text-xs text-slate-300 tabular-nums whitespace-nowrap text-right hidden lg:inline">
              {frames.length === 0 ? t("No weekly history yet") : activeFrame ? t("Week of {d} · {v} per 1,000", { d: new Date(activeFrame.week).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" }), v: activeFrame.index.toFixed(1) }) : t("{n} weeks available", { n: frames.length })}
            </span>
          </>
        ) : (
          <>
        <div className="flex gap-1">
          {HOURS.map((h) => (
            <button key={h} onClick={() => { setHours(h); setPeriod(null); setPlayhead(null); setPlaying(false); }}
              className={`text-xs rounded px-2 py-1 ${h === hours && !period ? "bg-white/90 text-slate-900 font-medium" : "bg-white/10 hover:bg-white/20"}`}>
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
          <span className="w-px bg-white/15 mx-0.5" aria-hidden />
          {PERIODS.map((p) => (
            <button key={p} onClick={() => { setPeriod(p); setPlayhead(null); setPlaying(false); setTab("now"); track("select_period", { period: p }); }} title={t(p === "7d" ? "Last 7 days" : p === "30d" ? "Last 30 days" : "Last 12 months")}
              className={`text-xs rounded px-2 py-1 ${p === period ? "bg-white/90 text-slate-900 font-medium" : "bg-white/10 hover:bg-white/20"}`}>
              {p}
            </button>
          ))}
        </div>
        {period ? (
          <span className="flex-1 min-w-0 text-xs text-slate-300 truncate">
            {historyData ? t("{r} records of {s} species", { r: Math.round(historyData.records).toLocaleString(lang), s: historyData.species.toLocaleString(lang) }) : t("Loading")}
          </span>
        ) : (<>
        <button onClick={() => { setPlaying((p) => !p); if (playhead === null) setPlayhead(0); }} className="rounded bg-[#006cd9] hover:bg-[#2b84e6] text-sm px-3 py-1 font-medium">
          {playing ? t("Pause") : t("Play")}
        </button>
        <input type="range" min={0} max={total} step={total / 600} value={playhead ?? total}
          onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }} className="flex-1 accent-[#006cd9]" />
        <button onClick={() => { setPlaying(false); setPlayhead(null); }} className="text-xs text-slate-400 hover:text-white">{t("All")}</button>
        <span className="text-xs text-slate-300 tabular-nums w-40 text-right hidden sm:inline">
          {loading ? t("Loading") : playhead === null ? t("{n} detections", { n: detections.toLocaleString() }) : new Date(windowStart + playhead).toLocaleString(lang)}
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

function RailButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`w-14 h-14 rounded-md flex flex-col items-center justify-center gap-1 text-[10px] ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      {label}
    </button>
  );
}

function Thumb({ src, size }: { src?: string | null; size: 6 | 8 | 10 }) {
  const cls = size === 6 ? "w-6 h-6" : size === 8 ? "w-8 h-8" : "w-10 h-10";
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={`${cls} rounded-full object-cover shrink-0 bg-slate-800`} loading="lazy" /> : <span className={`${cls} rounded-full bg-slate-800 shrink-0 inline-block`} />;
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        <span className="text-[10px] text-slate-500">{hint}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({ name, sci, value, tone, onClick, thumb }: { name: string; sci: string; value: string; tone: "warm" | "cool" | "neutral"; onClick: () => void; thumb?: string | null }) {
  const toneCls = tone === "warm" ? "text-[#E76826]" : tone === "cool" ? "text-[#268cfb]" : "text-slate-300";
  return (
    <button onClick={onClick} className="flex items-center gap-2 px-2 py-1 -mx-2 rounded hover:bg-white/5 text-left">
      <Thumb src={thumb} size={8} />
      <span className="min-w-0 flex-1"><span className="text-sm block truncate">{name}</span><span className="text-[11px] text-slate-500 italic block truncate">{sci}</span></span>
      <span className={`text-xs tabular-nums shrink-0 ${toneCls}`}>{value}</span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: color }} />{label}</span>;
}
