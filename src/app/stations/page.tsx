import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TR } from "@/components/TR";
import { sql } from "@/lib/db";
import { roundTo } from "@/lib/optin";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Stations: the sensors and observers behind the map",
  alternates: { canonical: "/stations" },
  description: "How many acoustic stations, camera traps and observers feed Wildlife Network, and the stations whose owners send their detections directly.",
};

const LABEL: Record<string, ReactNode> = { birdweather: <TR k="BirdWeather stations" />, inaturalist: <TR k="iNaturalist observers" />, gbif: <TR k="GBIF datasets (live)" /> };

const KIND: Record<string, ReactNode> = { "acoustic-recorder": <TR k="Sound recorder" />, "bat-detector": <TR k="Bat detector" />, "camera-trap": <TR k="Camera trap" />, "ultrasonic-recorder": <TR k="Bat detector" /> };

export default async function Stations() {
  const [bySource, direct, optins, devices] = await Promise.all([
    sql<{ source_system: string; active: number; total: number }[]>`
      SELECT source_system, COUNT(*) FILTER (WHERE last_seen > now() - interval '7 days')::int AS active, COUNT(*)::int AS total
      FROM deployments GROUP BY 1 ORDER BY 2 DESC`,
    sql<{ id: string; name: string | null; sensor_type: string | null; sensor_model: string | null; lat: number; lon: number; last_seen: string | null; n: number }[]>`
      SELECT d.id, d.name, d.sensor_type, d.sensor_model, ROUND(d.latitude::numeric, 1)::float AS lat, ROUND(d.longitude::numeric, 1)::float AS lon, d.last_seen::text,
             (SELECT COUNT(*) FROM events e WHERE e.deployment_id = d.id)::int AS n
      FROM deployments d WHERE d.source_system NOT IN ('birdweather', 'inaturalist', 'gbif', 'acartia', 'obis', 'orcasound')
      ORDER BY d.last_seen DESC NULLS LAST LIMIT 200`,
    sql<{ station_id: number; display_name: string | null; station_type: string | null; lat: number | null; lon: number | null; precision_km: number; license: string; species: number; days: number }[]>`
      SELECT o.station_id, o.display_name, o.station_type, o.lat, o.lon, o.precision_km, o.license,
             COUNT(DISTINCT d.scientific_name)::int AS species, COUNT(DISTINCT d.day)::int AS days
      FROM bw_optin o LEFT JOIN bw_optin_daily d USING (station_id)
      WHERE o.status = 'active' GROUP BY 1 ORDER BY o.created_at`.catch(() => []),
    sql<{ id: string; name: string; model: string; last_status: { battery?: { percent?: number }; storage?: { freeMb?: number; totalMb?: number }; queue?: { pending?: number } } | null; last_status_at: string | null }[]>`
      SELECT id, name, model, last_status, last_status_at::text FROM devices
      WHERE last_status_at > now() - interval '30 days' ORDER BY last_status_at DESC LIMIT 200`.catch(() => []),
  ]);
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Stations" /></h1>
        <p className="mt-3"><TR k="Everything on the map comes from people: station owners, camera trappers and observers. Active means seen in the last seven days." /></p>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {bySource.filter((s) => LABEL[s.source_system]).map((s) => (
            <div key={s.source_system} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <dt className="text-xs text-slate-400">{LABEL[s.source_system]}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{s.active.toLocaleString("en-GB")}</dd>
              <dd className="text-xs text-slate-400"><TR k="{n} known" v={{ n: s.total.toLocaleString("en-GB") }} /></dd>
            </div>
          ))}
          <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3">
            <dt className="text-xs text-cyan-200"><TR k="Sending directly" /></dt>
            <dd className="text-2xl font-semibold text-slate-100">{direct.length.toLocaleString("en-GB")}</dd>
            <dd className="text-xs text-slate-400"><TR k="owner chooses the licence" /></dd>
          </div>
        </dl>

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="BirdWeather stations that opted in" /></h2>
        <p className="mt-2">
          <TR k="These owners chose to share their station's full daily counts, under their own licence, at the precision they picked. [Add your BirdWeather station](/stations/join)." />
        </p>
        {optins.length ? (
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium"><TR k="Station" /></th><th className="font-medium"><TR k="Where" /></th><th className="font-medium"><TR k="Licence" /></th><th className="font-medium text-right"><TR k="Species" /></th><th className="font-medium text-right"><TR k="Days" /></th></tr></thead>
            <tbody>
              {optins.map((o, i) => (
                <tr key={o.station_id} className="border-b border-white/5">
                  <td className="py-1.5">{o.display_name ?? <TR k="Anonymous station {n}" v={{ n: i + 1 }} />}</td>
                  <td>{o.lat != null && o.lon != null ? `${roundTo(o.lat, o.precision_km)}°, ${roundTo(o.lon, o.precision_km)}° (±${o.precision_km} km)` : ""}</td>
                  <td>{o.license === "CC0-1.0" ? "CC0" : "CC BY 4.0"}</td>
                  <td className="text-right">{o.species.toLocaleString("en-GB")}</td>
                  <td className="text-right">{o.days.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4"><TR k="No BirdWeather station has opted in yet. [Be the first](/stations/join)." /></p>
        )}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Stations sending directly" /></h2>
        <p className="mt-2">
          <TR k="These owners run our free station program (wdx-agent) on a BirdNET-Pi, BirdNET-Go, bat detector or camera trap. Their detections are published under the licence they choose, so they can go into the [open data releases](/data). Coordinates are rounded to about 1 km on the device." />
        </p>
        {direct.length ? (
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium"><TR k="Station" /></th><th className="font-medium"><TR k="Kind of station" /></th><th className="font-medium"><TR k="Where" /></th><th className="font-medium text-right"><TR k="Detections" /></th></tr></thead>
            <tbody>
              {direct.map((d) => (
                <tr key={d.id} className="border-b border-white/5">
                  <td className="py-1.5">{d.name ?? d.id.split(":").slice(1).join(":")}</td>
                  <td>{KIND[d.sensor_type ?? ""] ?? <TR k="Station" />}</td>
                  <td>{d.lat}°, {d.lon}°</td>
                  <td className="text-right">{d.n.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4"><TR k="No station sends directly yet. Yours could be the first." /></p>
        )}
        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Device health" /></h2>
        <p className="mt-2">
          <TR k="Wildlife Network Bases and other registered devices report their battery, storage and backlog. Shown here: devices that reported in the last 30 days. Health reports carry no detections and no location." />
        </p>
        {devices.length ? (
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium"><TR k="Device" /></th><th className="font-medium"><TR k="Type" /></th><th className="font-medium"><TR k="Last report" /></th><th className="font-medium text-right"><TR k="Battery" /></th><th className="font-medium text-right"><TR k="Storage free" /></th><th className="font-medium text-right"><TR k="Waiting to send" /></th></tr></thead>
            <tbody>
              {devices.map((d) => {
                const st = d.last_status ?? {};
                const free = st.storage?.freeMb != null && st.storage?.totalMb ? Math.round((100 * st.storage.freeMb) / st.storage.totalMb) : null;
                return (
                  <tr key={d.id} className="border-b border-white/5">
                    <td className="py-1.5">{d.name}</td>
                    <td>{d.model}</td>
                    <td>{d.last_status_at ? new Date(d.last_status_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" : ""}</td>
                    <td className="text-right">{st.battery?.percent != null ? `${Math.round(st.battery.percent)}%` : ""}</td>
                    <td className="text-right">{free != null ? `${free}%` : ""}</td>
                    <td className="text-right">{st.queue?.pending != null ? st.queue.pending.toLocaleString("en-GB") : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4"><TR k="No device has reported its health yet." /></p>
        )}
        <p className="mt-6">
          <Link href="/contribute" className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400"><TR k="Add your station" /></Link>
        </p>
      </div>
    </main>
  );
}
