"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { NAV } from "@/lib/nav";
import { PageLang } from "@/components/T";

const isActive = (path: string, href: string) => path === href || (href !== "/report" && path.startsWith(href + "/"));

/** Slim header for every page except the map: logo to the map, five sections as menus, language. Collapses to a menu button on phones. */
export function SiteHeader() {
  const t = useT();
  const path = usePathname() ?? "";
  const [open, setOpen] = useState<string | null>(null); // desktop section menu
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Close menus on a link click, an outside click and Escape.
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMobile(false); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, []);

  const link = (href: string, label: string, cls: string): ReactNode => (
    <Link key={href} href={href} onClick={() => { setOpen(null); setMobile(false); }} aria-current={isActive(path, href) ? "page" : undefined}
      className={`${cls} ${isActive(path, href) ? "text-cyan-300" : "text-slate-200"} hover:bg-white/10 hover:text-white`}>{t(label)}</Link>
  );

  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 text-sm backdrop-blur print:hidden">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-cyan-500 focus:px-3 focus:py-1 focus:text-slate-950">{t("Skip to content")}</a>
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-slate-100 hover:text-white" title={t("Open the live map")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={22} height={22} />
          <span className="whitespace-nowrap">Wildlife Network</span>
        </Link>
        <nav aria-label={t("Site sections")} className="ml-4 hidden items-center gap-0.5 lg:flex">
          {NAV.map((g) => {
            const here = g.links.some((l) => isActive(path, l.href));
            return (
              <div key={g.label} className="relative">
                <button type="button" aria-expanded={open === g.label} onClick={() => setOpen(open === g.label ? null : g.label)}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 hover:bg-white/10 ${here ? "text-cyan-300" : "text-slate-300"}`}>
                  {t(g.label)}
                  <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className={open === g.label ? "rotate-180" : ""}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                </button>
                {open === g.label && (
                  <div className="absolute left-0 top-full mt-1 min-w-56 rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl">
                    {g.links.map((l) => link(l.href, l.label, "block rounded-md px-3 py-2"))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <PageLang />
          <Link href="/" className="hidden rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400 whitespace-nowrap sm:inline-block">{t("Live map")}</Link>
          <button type="button" onClick={() => setMobile(!mobile)} aria-expanded={mobile} aria-controls="site-menu"
            className="rounded-md px-2.5 py-1.5 text-slate-200 hover:bg-white/10 lg:hidden">
            <span className="sr-only">{t("Menu")}</span>
            <svg aria-hidden width="20" height="20" viewBox="0 0 20 20">
              {mobile ? <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" /> : <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" />}
            </svg>
          </button>
        </div>
      </div>
      {mobile && (
        <nav id="site-menu" aria-label={t("Site sections")} className="max-h-[calc(100vh-3rem)] overflow-y-auto border-t border-white/10 px-4 pb-4 lg:hidden">
          {link("/", "Live map", "mt-2 block rounded-md px-2 py-2 font-medium")}
          {NAV.map((g) => (
            <div key={g.label} className="mt-3">
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t(g.label)}</p>
              {g.links.map((l) => link(l.href, l.label, "block rounded-md px-2 py-2"))}
            </div>
          ))}
        </nav>
      )}
    </header>
  );
}
