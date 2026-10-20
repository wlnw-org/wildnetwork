"use client";

import { useEffect, useState } from "react";
import { track } from "./Analytics";
import { creditLine, type XcArea, type XcClip } from "@/lib/xenocanto";

/** Pauses every other <audio> on the page, so only one clip (or popup recording) plays at a time. */
function soloPlay(e: React.SyntheticEvent<HTMLAudioElement>) {
  document.querySelectorAll("audio").forEach((a) => { if (a !== e.currentTarget) a.pause(); });
}

/**
 * Up to two reference recordings from xeno-canto, streamed from xeno-canto itself (preload="none": nothing loads until play).
 * Hidden while loading, when there are none, and when the proxy or xeno-canto fails.
 */
export default function ListenBlock({ name, area }: { name: string; area: XcArea | null }) {
  const [res, setRes] = useState<{ key: string; clips: XcClip[] } | null>(null);
  // Recordists can withdraw recordings at any time; a clip whose audio no longer loads is dropped until the cache refreshes.
  const [gone, setGone] = useState<string[]>([]);
  const key = `${name}|${area ?? ""}`;
  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ species: name, ...(area ? { area } : {}) });
    fetch(`/api/v1/recordings?${q}`).then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((d: { clips?: XcClip[] }) => { if (!cancelled) setRes({ key, clips: Array.isArray(d.clips) ? d.clips : [] }); })
      .catch(() => { if (!cancelled) setRes({ key, clips: [] }); });
    return () => { cancelled = true; };
  }, [name, area, key]);

  const clips = (res?.key === key ? res.clips : []).filter((c) => !gone.includes(c.id));
  if (clips.length === 0) return null;
  return (
    <section aria-labelledby="listen-h" className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
      <h3 id="listen-h" className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Listen</h3>
      <p className="text-[11px] text-slate-400 mb-2">Reference recordings of this species, to compare with what stations hear.</p>
      <ul className="space-y-3">
        {clips.map((c) => {
          const what = [c.type || "recording", c.seconds != null ? `${c.seconds} s` : null].filter(Boolean).join(", ");
          return (
            <li key={c.id}>
              {c.sonogram && (
                // Hot-linked from xeno-canto, not copied.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.sonogram} alt={`Sonogram of XC${c.id}`} loading="lazy" className="w-full h-14 object-cover rounded bg-white" />
              )}
              <audio controls preload="none" src={c.file} onError={() => setGone((g) => [...g, c.id])} onPlay={(e) => { soloPlay(e); track("play_recording", { species: name, xc: c.id }); }}
                aria-label={`Play xeno-canto recording XC${c.id}, ${what}, by ${c.recordist || "unknown recordist"}`} className="w-full h-9 mt-1" />
              <p className="text-[11px] text-slate-400 leading-snug mt-1">
                <span className="text-slate-300">{what}</span>{c.quality && <> · quality {c.quality}</>}<br />
                {creditLine(c)} ·{" "}
                <a href={c.url} target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline">XC{c.id}</a> ·{" "}
                <a href={c.license.url} target="_blank" rel="noreferrer license" className="text-cyan-500 hover:underline">{c.license.name}</a>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500 mt-2">
        Recordings courtesy of <a href="https://xeno-canto.org" target="_blank" rel="noreferrer" className="text-cyan-500 hover:underline">xeno-canto.org</a>
      </p>
    </section>
  );
}
