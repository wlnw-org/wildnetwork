"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { CONTACT_EMAIL, NAV } from "@/lib/nav";
import { SOCIAL } from "@/lib/site";
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
            <a href="https://github.com/wlnw-org/wildnetwork" className="text-cyan-400 hover:underline">{t("Code")}</a>{" · "}
            <a href="https://github.com/sponsors/arunrajiah" className="text-cyan-400 hover:underline">{t("Support this project")}</a>
          </p>
          <div className="flex shrink-0 items-center gap-4">
            <nav aria-label={t("Follow Wildlife Network")} className="flex items-center gap-3">
              {SOCIAL.map((s) => (
                <a key={s.name} href={s.href} rel="me noopener" target="_blank" title={t(s.label)} aria-label={t(s.label)} className="text-slate-400 hover:text-cyan-300">
                  <SocialIcon name={s.name} />
                </a>
              ))}
            </nav>
            <p>{t("Contact")}: <a href={`mailto:${CONTACT_EMAIL}`} className="text-cyan-400 hover:underline">{CONTACT_EMAIL}</a></p>
          </div>
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

/** Simple monochrome brand marks (currentColor), 18 px. */
function SocialIcon({ name }: { name: string }) {
  if (name === "LinkedIn") return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" /></svg>
  );
  if (name === "X") return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3Z" /></svg>
  );
  if (name === "YouTube") return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9l5.8 3.1-5.8 3.1Z" /></svg>
  );
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5Z" /></svg>
  );
}
