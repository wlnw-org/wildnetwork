"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { CONTACT_EMAIL, NAV } from "@/lib/nav";
import { SiteHeader } from "@/components/SiteHeader";

/** Footer for every page except the map: the same sections as the header, licence and contact. */
export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-t border-white/10 bg-slate-950 text-sm text-slate-400 print:hidden">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {NAV.map((g) => (
            <div key={g.label}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t(g.label)}</h2>
              <ul className="mt-2 space-y-1.5">
                {g.links.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-cyan-300 hover:underline">{t(l.label)}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <Link href="/" className="font-medium text-slate-200 hover:underline">Wildlife Network</Link>{" · "}
            {t("Open source under AGPL-3.0. Records keep their sources' licences; credits are on each page and in Methods.")}{" "}
            <a href="https://github.com/wlnw-org/wildnetwork" className="text-cyan-400 hover:underline">{t("Code")}</a>
          </p>
          <p className="shrink-0">{t("Contact")}: <a href={`mailto:${CONTACT_EMAIL}`} className="text-cyan-400 hover:underline">{CONTACT_EMAIL}</a></p>
        </div>
      </div>
    </footer>
  );
}

/** Header and footer around every page except the full-screen map at /, which has its own shell. */
export default function SiteChrome({ children }: { children: ReactNode }) {
  const map = usePathname() === "/";
  if (map) return <>{children}</>;
  return (
    <>
      <SiteHeader />
      <div id="content" className="flex flex-1 flex-col bg-slate-950">{children}</div>
      <SiteFooter />
    </>
  );
}
