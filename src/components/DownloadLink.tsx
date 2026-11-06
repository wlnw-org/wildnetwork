"use client";
import { track } from "@/components/Analytics";
import { useT } from "@/lib/i18n";

/** A CSV download link that records the download_csv analytics event. `k` is translated like <T>. */
export default function DownloadLink({ href, k, what, className }: { href: string; k: string; what: string; className?: string }) {
  const t = useT();
  return (
    <a href={href} rel="nofollow" onClick={() => track("download_csv", { what })} className={className ?? "text-cyan-400 hover:underline"}>{t(k)}</a>
  );
}
