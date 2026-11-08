"use client";
import { useSyncExternalStore } from "react";
import { track } from "@/components/Analytics";
import { STUDIO_DOWNLOADS } from "@/lib/site";

type Os = "mac" | "windows" | "other";

const noop = () => () => {};
function detectOs(): Os {
  const ua = navigator.userAgent;
  return /Windows/i.test(ua) ? "windows" : /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "mac" : "other";
}

/** One-click download buttons for Wildlife Network Studio; the visitor's own system comes first. */
export default function StudioDownload() {
  const os = useSyncExternalStore(noop, detectOs, () => "other" as Os);
  const mac = { os: "mac" as const, label: "Download for Mac", sub: "Apple Silicon (M1 or newer), macOS 11+", href: STUDIO_DOWNLOADS.mac };
  const win = { os: "windows" as const, label: "Download for Windows", sub: "64-bit, Windows 10 or 11", href: STUDIO_DOWNLOADS.windows };
  const order = os === "windows" ? [win, mac] : [mac, win];
  return (
    <>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      {order.map((b, i) => (
        <a key={b.os} href={b.href} onClick={() => track("download_studio", { os: b.os })}
          className={`flex-1 rounded-xl px-5 py-4 text-center transition ${i === 0 && os !== "other" ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "border border-slate-700 text-slate-100 hover:border-cyan-400"}`}>
          <span className="block text-base font-semibold">{b.label}</span>
          <span className={`block text-xs ${i === 0 && os !== "other" ? "text-slate-900" : "text-slate-400"}`}>{b.sub}</span>
        </a>
      ))}
    </div>
    <p className="mt-2 text-sm text-slate-400">
      Mac with an Intel processor? <a href={STUDIO_DOWNLOADS.macIntel} onClick={() => track("download_studio", { os: "mac-intel" })} className="text-cyan-400 hover:underline">Download for Intel Mac</a>.
      Not sure? Apple menu, About This Mac: &quot;Chip: Apple&quot; means Apple Silicon, &quot;Processor: Intel&quot; means Intel.
    </p>
    </>
  );
}
