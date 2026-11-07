"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useT } from "@/lib/i18n";

/**
 * "Choose on map": opens a map; a click (or dragging the pin) picks a place. It fills the form's latitude and longitude
 * inputs (by name), or calls onPick. Typing the numbers keeps working without it.
 */
export default function MapPick({ latName = "lat", lonName = "lon", onPick, lat, lon }: { latName?: string; lonName?: string; onPick?: (lat: number, lon: number) => void; lat?: number | null; lon?: number | null }) {
  const t = useT();
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pt, setPt] = useState<[number, number] | null>(null);
  const startRef = useRef<[number, number] | null>(null);

  function current(): [number, number] | null {
    if (lat != null && lon != null) return [lat, lon];
    const f = btn.current?.closest("form");
    const v = (n: string) => ((f?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "").trim();
    const [la, lo] = [v(latName), v(lonName)];
    return la && lo && Number.isFinite(Number(la)) && Number.isFinite(Number(lo)) ? [Number(la), Number(lo)] : null;
  }

  useEffect(() => {
    if (!open) return;
    let map: MLMap | null = null;
    let cancelled = false;
    const start = startRef.current;
    import("maplibre-gl").then(({ Map: M, Marker: Mk, NavigationControl, setWorkerUrl }) => {
      if (cancelled || !box.current) return;
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new M({ container: box.current, style: "https://tiles.openfreemap.org/styles/dark", center: start ? [start[1], start[0]] : [30, 15], zoom: start ? 7 : 1.5, renderWorldCopies: false, attributionControl: { compact: true } });
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      const marker: Marker = new Mk({ draggable: true, color: "#22d3ee" });
      if (start) marker.setLngLat([start[1], start[0]]).addTo(map);
      const set = (lng: number, la: number) => { marker.setLngLat([lng, la]).addTo(map!); setPt([Number(la.toFixed(4)), Number(lng.toFixed(4))]); };
      map.on("click", (e) => set(e.lngLat.lng, e.lngLat.lat));
      marker.on("dragend", () => { const p = marker.getLngLat(); set(p.lng, p.lat); });
    });
    return () => { cancelled = true; map?.remove(); };
    // Opened once per click on the button.
  }, [open]);

  function use() {
    if (!pt) return;
    if (onPick) onPick(pt[0], pt[1]);
    else {
      const f = btn.current?.closest("form");
      const setVal = (name: string, v: number) => {
        const el = f?.elements.namedItem(name) as HTMLInputElement | null;
        if (!el) return;
        // React-controlled or not, the input sees a real change.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, String(v));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setVal(latName, pt[0]);
      setVal(lonName, pt[1]);
    }
    setOpen(false);
  }

  return (
    <>
      <button type="button" ref={btn} onClick={() => { const c = current(); startRef.current = c; setPt(c); setOpen(true); }} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5">{t("Choose on map")}</button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-slate-300">{t("Click the map or drag the pin. Zoom in for precision.")}</p>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-cyan-400 hover:underline">{t("Close")}</button>
            </div>
            <div ref={box} className="mt-3 h-[60vh] max-h-[520px] overflow-hidden rounded-lg border border-white/10" />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-slate-400">{pt ? `${pt[0]}, ${pt[1]}` : "…"}</span>
              <button type="button" disabled={!pt} onClick={use} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{t("Use this place")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
