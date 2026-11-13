import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { TR } from "@/components/TR";
import { trRaw, type PageLang } from "@/lib/pageLang";

/** Same markup as rich() in TR.tsx ([label](href), **bold**), rendered on the server. */
function richServer(text: string): ReactNode {
  return text.split(/(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*)/g).map((s, i) => {
    const m = s.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) {
      const [, label, href] = m;
      if (href.startsWith("/") || href.startsWith("#")) return <Link key={i} href={href} className="text-cyan-400 hover:underline">{label}</Link>;
      return <a key={i} href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer" className="text-cyan-400 hover:underline">{label}</a>;
    }
    const b = s.match(/^\*\*([^*]+)\*\*$/);
    return b ? <b key={i} className="text-slate-100">{b[1]}</b> : <Fragment key={i}>{s}</Fragment>;
  });
}

/**
 * Body text on pages that exist per language: English keeps <TR> (the visitor's menu choice translates it in the browser);
 * /hi and /ta pages are translated here on the server, so search engines index the translation and no dictionary is sent.
 */
export function X({ lang, k, v }: { lang: PageLang; k: string; v?: Record<string, string | number> }) {
  return lang === "en" ? <TR k={k} v={v} /> : <>{richServer(trRaw(lang, k, v))}</>;
}
