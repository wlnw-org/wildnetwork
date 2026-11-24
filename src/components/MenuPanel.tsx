import Link from "next/link";
import { track } from "@/components/Analytics";
import { useT } from "@/lib/i18n";
import { NAV } from "@/lib/nav";

/** Every site section in the map panel: the same links as the footer of the other pages, so map visitors see them too. */
export default function MenuPanel() {
  const t = useT();
  return (
    <nav aria-label={t("Site sections")} className="p-5 text-sm overflow-y-auto h-full">
      <h2 className="text-base font-semibold text-slate-100">{t("Menu")}</h2>
      <Link href="/help" onClick={() => track("menu_link", { href: "/help" })}
        className="mt-3 block rounded-md bg-white/5 px-3 py-2 text-slate-100 hover:bg-white/10">{t("Help and how-to guides")}</Link>
      {NAV.map((g) => (
        <section key={g.label} className="mt-5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t(g.label)}</h3>
          <ul className="grid grid-cols-2 gap-x-3">
            {g.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => track("menu_link", { href: l.href })}
                  className="block rounded-md px-2 py-1.5 -mx-2 text-slate-200 hover:bg-white/10 hover:text-white">{t(l.label)}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
