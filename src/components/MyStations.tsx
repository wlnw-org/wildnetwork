"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TR, useBodyT } from "@/components/TR";
import { useAgo } from "@/components/StationFeed";
import { useLang } from "@/lib/i18n";
import type { MyDevice } from "@/lib/myStations";

const field = "w-full rounded-md bg-slate-900 border border-white/15 px-3 py-2 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500";
const btn = "rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-100 hover:border-cyan-500 disabled:opacity-50";

async function post(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  try {
    const r = await fetch("/api/v1/stations/mine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json()) as { ok?: boolean; error?: string };
  } catch { return { error: "network" }; }
}

function useErrorText() {
  const tb = useBodyT();
  return (code: string | undefined) => {
    switch (code) {
      case "bad-key": return tb("That key was not accepted. Copy it again, the whole line after api_key =, without spaces.");
      case "not-device": return tb("That key works, but it was made for sending data only, not for one station, so it cannot manage a station here.");
      case "too-many": return tb("Too many tries from your network in the last hour. Please wait an hour and try again.");
      case "not-claimed": return tb("This browser has not been given this station's key. Add it again with the key.");
      case "network": return tb("Could not reach the server. Please try again.");
      default: return tb("Something went wrong. Please try again.");
    }
  };
}

export function ClaimForm() {
  const tb = useBodyT();
  const err = useErrorText();
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setAdded(false);
    const r = await post({ action: "claim", key });
    setBusy(false);
    if (r.ok) { setKey(""); setAdded(true); router.refresh(); } else setError(err(r.error));
  };
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border border-white/10 bg-slate-900/60 p-4">
      <label className="block text-sm font-medium text-slate-100" htmlFor="device-key"><TR k="Device key" /></label>
      <input id="device-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)}
        placeholder="wn_..." className={field} required />
      <button type="submit" disabled={busy || key.trim().length < 10} className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
        {busy ? tb("Checking...") : tb("Add my station")}
      </button>
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      {added && <p role="status" className="text-sm text-emerald-300">{tb("Station added. It is listed below.")}</p>}
    </form>
  );
}

const fmtUptime = (s: number, tb: ReturnType<typeof useBodyT>) =>
  s >= 86400 ? tb("{n} days", { n: Math.floor(s / 86400) }) : s >= 3600 ? tb("{n} hours", { n: Math.floor(s / 3600) }) : tb("{n} minutes", { n: Math.max(1, Math.floor(s / 60)) });

function Health({ h }: { h: Record<string, unknown> | null }) {
  const tb = useBodyT();
  if (!h) return <p className="text-sm text-slate-400">{tb("No health report yet. A Wildlife Network Base sends one every 15 minutes once it is online.")}</p>;
  const mic = h.microphone as { active?: boolean } | undefined;
  const st = h.storage as { freeMb?: number; totalMb?: number } | undefined;
  const net = h.network as { type?: string | null; signal?: number | null; signalUnit?: string | null } | undefined;
  const q = h.queue as { pending?: number } | undefined;
  const rows: [string, string][] = [];
  if (mic) rows.push([tb("Microphone"), mic.active ? tb("working") : tb("not working")]);
  if (typeof h.temperatureC === "number") rows.push([tb("Temperature"), `${h.temperatureC} °C${h.temperatureC > 75 ? ` (${tb("too hot")})` : ""}`]);
  if (st?.freeMb != null) rows.push([tb("Storage"), st.totalMb ? tb("{free} GB free of {total} GB", { free: (st.freeMb / 1024).toFixed(1), total: (st.totalMb / 1024).toFixed(1) }) : tb("{free} GB free", { free: (st.freeMb / 1024).toFixed(1) })]);
  if (typeof h.uptimeSeconds === "number") rows.push([tb("Running for"), fmtUptime(h.uptimeSeconds, tb)]);
  if (net && (net.type || net.signal != null)) {
    const kind = net.type === "wifi" ? tb("Wi-Fi") : net.type === "4g" ? tb("mobile (4G)") : net.type === "ethernet" ? tb("cable") : net.type ?? "";
    rows.push([tb("Connection"), [kind, net.signal != null ? tb("signal {n}", { n: `${net.signal}${net.signalUnit ? ` ${net.signalUnit}` : ""}` }) : ""].filter(Boolean).join(", ")]);
  }
  if (q?.pending != null) rows.push([tb("Waiting to send"), q.pending === 0 ? tb("nothing, all sent") : tb("{n} detections", { n: q.pending })]);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-400">{k}</dt><dd className="text-slate-100">{v}</dd></div>)}
    </dl>
  );
}

export function DeviceCard({ d }: { d: MyDevice }) {
  const tb = useBodyT();
  const err = useErrorText();
  const ago = useAgo();
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    const r = await post({ ...body, device: d.id });
    setBusy(false);
    if (r.ok) router.refresh(); else setError(err(r.error));
  };
  const until = d.alertsPausedUntil ? new Date(d.alertsPausedUntil) : null;
  const forever = d.alertsPausedForever;
  const date = until?.toLocaleString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <li className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-100 [overflow-wrap:anywhere]">{d.name}</h2>
        {d.state === "online" && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">{tb("Online")}</span>}
        {d.state === "off" && <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-xs font-medium text-slate-300">{tb("Off")}</span>}
      </div>
      {d.state === "off" && d.healthAt && (
        <p className="mt-1 text-sm text-slate-400">{tb("Not reporting since {ago}. If you switched it off, there is nothing to do: nobody is alerted. Otherwise check its power and internet.", { ago: ago(d.healthAt) || d.healthAt.slice(0, 16).replace("T", " ") + " UTC" })}</p>
      )}
      <p className="mt-1 text-sm text-slate-400">
        {d.lastHeard ? tb("Last heard from {ago}.", { ago: ago(d.lastHeard) || d.lastHeard.slice(0, 16).replace("T", " ") + " UTC" }) : tb("Nothing heard from this station yet.")}
        {" "}
        {d.stationUrl
          ? <Link href={d.stationUrl} className="text-cyan-400 hover:underline">{tb("Public station page")}</Link>
          : <span>{d.test ? tb("Test stations have no public page.") : tb("Its public page appears once it has sent detections.")}</span>}
      </p>

      <h3 className="mt-4 text-sm font-semibold text-slate-200">{tb("Health")}</h3>
      <div className="mt-1"><Health h={d.health} /></div>

      <h3 className="mt-4 text-sm font-semibold text-slate-200">{tb("Test station")}</h3>
      <p className="mt-1 text-sm">
        {d.test ? tb("On: its detections stay off the public map, reports and open data.") : tb("Off: its detections are public.")}
      </p>
      <button className={`${btn} mt-2`} disabled={busy} onClick={() => act({ action: "test", on: !d.test })}>
        {d.test ? tb("Turn test mode off") : tb("Turn test mode on")}
      </button>

      <h3 className="mt-4 text-sm font-semibold text-slate-200">{tb("Alerts")}</h3>
      <p className="mt-1 text-sm">
        {!until ? tb("On: if this station loses its microphone or runs hot while it is running, the Wildlife Network team is emailed so they can help. Switching it off is your choice and is never reported. Pause alerts while you repair it.")
          : forever ? tb("Paused until you turn them back on.")
          : tb("Paused until {date}.", { date: date ?? "" })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {until
          ? <button className={btn} disabled={busy} onClick={() => act({ action: "resume" })}>{tb("Turn them back on")}</button>
          : <>
              <span className="self-center text-sm text-slate-400">{tb("Pause for:")}</span>
              <button className={btn} disabled={busy} onClick={() => act({ action: "pause", pause: "day" })}>{tb("1 day")}</button>
              <button className={btn} disabled={busy} onClick={() => act({ action: "pause", pause: "week" })}>{tb("1 week")}</button>
              <button className={btn} disabled={busy} onClick={() => act({ action: "pause", pause: "month" })}>{tb("1 month")}</button>
              <button className={btn} disabled={busy} onClick={() => act({ action: "pause", pause: "forever" })}>{tb("Until I turn them back on")}</button>
            </>}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
      <button className="mt-4 text-sm text-slate-400 underline hover:text-slate-200" disabled={busy} onClick={() => act({ action: "forget" })}>
        {tb("Forget this station on this browser")}
      </button>
    </li>
  );
}
