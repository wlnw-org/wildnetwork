"use client";
import { useSyncExternalStore } from "react";
import { track } from "@/components/Analytics";
import { studioDownload } from "@/lib/site";
import { TR } from "@/components/TR";

type Os = "mac" | "windows" | "linux" | "other";

const noop = () => () => {};
function detectOs(): Os {
  const ua = navigator.userAgent;
  return /Windows/i.test(ua) ? "windows" : /Linux/i.test(ua) && !/Android/i.test(ua) ? "linux" : /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "mac" : "other";
}

/** One-click download buttons for Wildlife Network Studio; the visitor's own system comes first. */
export default function StudioDownload() {
  const os = useSyncExternalStore(noop, detectOs, () => "other" as Os);
  const mac = { os: "mac" as const, label: <TR k="Download for Mac" />, sub: <TR k="Apple Silicon (M1 or newer), macOS 11+" />, href: studioDownload("mac") };
  const win = { os: "windows" as const, label: <TR k="Download for Windows" />, sub: <TR k="64-bit, Windows 10 or 11" />, href: studioDownload("windows") };
  const lin = { os: "linux" as const, label: <TR k="Download for Linux" />, sub: <TR k="64-bit AppImage, Ubuntu 22.04+ and similar" />, href: studioDownload("linux") };
  const order = os === "windows" ? [win, mac] : os === "linux" ? [lin, win, mac] : [mac, win];
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
      <TR k="Mac with an Intel processor?" /> <a href={studioDownload("macIntel")} onClick={() => track("download_studio", { os: "mac-intel" })} className="text-cyan-400 hover:underline"><TR k="Download for Intel Mac" /></a>.
      {" "}<TR k="Not sure? Apple menu, About This Mac: “Chip: Apple” means Apple Silicon, “Processor: Intel” means Intel." />
      {os !== "linux" && <> <TR k="Linux?" /> <a href={studioDownload("linux")} onClick={() => track("download_studio", { os: "linux" })} className="text-cyan-400 hover:underline"><TR k="Download the AppImage" /></a>.</>}
    </p>
    </>
  );
}
