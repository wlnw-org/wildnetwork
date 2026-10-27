"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import SignIn, { useMe } from "./SignIn";

const GROUPS = [["avian", "Birds"], ["bat", "Bats"], ["amphibian", "Frogs and toads"], ["insect", "Insects"], ["mammal", "Mammals"], ["marine", "Marine"]];
const snap = (v: number) => Math.floor(v / 5) * 5;

/** New study area: pan and zoom the map to the area (snapped to the 5 degree grid), then name it. */
export default function StudyForm() {
  const me = useMe();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [state, setState] = useState<{ busy?: boolean; msg?: string }>({});

  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then(({ Map: M, setWorkerUrl, NavigationControl }) => {
      if (cancelled || !box.current || map.current) return;
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const m = new M({ container: box.current, style: "https://tiles.openfreemap.org/styles/dark", center: [10, 45], zoom: 3, renderWorldCopies: false, attributionControl: { compact: true } });
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      const update = () => {
        const b = m.getBounds();
        const w = Math.max(-180, snap(b.getWest())), s = Math.max(-90, snap(b.getSouth())), e = Math.min(180, snap(b.getEast()) + 5), n = Math.min(90, snap(b.getNorth()) + 5);
        setBbox([w, s, e, n]);
        const fc: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
        const src = m.getSource("box") as unknown as { setData?: (d: GeoJSON.Feature) => void } | undefined;
        if (src?.setData) src.setData(fc);
      };
      m.on("load", () => {
        m.addSource("box", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "box", type: "line", source: "box", paint: { "line-color": "#22d3ee", "line-width": 2 } });
        update();
      });
      m.on("moveend", update);
      // Start near the visitor.
      fetch("/api/v1/near").then((r) => r.json()).then((p: { lat?: number; lon?: number }) => { if (p.lat != null && p.lon != null) m.jumpTo({ center: [p.lon, p.lat], zoom: 4 }); }).catch(() => {});
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  const cells = bbox ? ((bbox[2] - bbox[0]) / 5) * ((bbox[3] - bbox[1]) / 5) : 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ busy: true });
    const species = String(f.get("species") ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const r = await fetch("/api/v1/studies", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: f.get("title"), question: f.get("question"), grp: f.get("grp"), species, email: f.get("email"), bbox }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.id) router.push(`/studies/${d.id}`);
    else setState({ msg: d.error ?? "Could not create the study." });
  }

  const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500";
  return (
    <div className="mt-4">
      <div className="mb-4"><SignIn me={me} next="/studies/new" /></div>
      <div ref={box} className="h-80 w-full overflow-hidden rounded-lg border border-white/10" />
      <p className="mt-2 text-sm text-slate-400">
        Pan and zoom until the cyan box covers your study area. It snaps outwards to whole 5 degree cells.
        {bbox && <> Now: {bbox[1]}° to {bbox[3]}° latitude, {bbox[0]}° to {bbox[2]}° longitude, {cells} cells{cells > 400 ? " (too large: zoom in, the limit is 400)" : ""}.</>}
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-2">
        <input name="title" required placeholder="Title, e.g. Spring arrivals in the Western Ghats" aria-label="Title" className={input} />
        <textarea name="question" rows={3} placeholder="Research question (optional, shown on the study page)" aria-label="Research question" className={input} />
        <select name="grp" aria-label="Class" className={input} defaultValue="avian">{GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <textarea name="species" rows={2} placeholder="Species to follow (optional): scientific names separated by commas. Empty = all species of the class." aria-label="Species" className={input} />
        <input name="email" type="email" placeholder="Email for the weekly digest (optional)" aria-label="Email for the weekly digest" className={input} />
        <button disabled={!me?.user || state.busy || cells > 400} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
          {me?.user ? (state.busy ? "Creating..." : "Create study area") : "Sign in with ORCID to create a study area"}
        </button>
        {state.msg && <p className="text-sm text-rose-300">{state.msg}</p>}
        <p className="text-xs text-slate-500">Study areas are public: anyone with the link sees the dashboard. Your email is stored encrypted and used only for the digest.</p>
      </form>
    </div>
  );
}
