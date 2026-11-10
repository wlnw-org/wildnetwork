"use client";
import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useLang, type Lang } from "@/lib/i18n";

/**
 * Page body text in the visitor's language. Unlike the map's dictionaries (src/lib/messages.ts, always bundled), body text for
 * the visitor pages lives in public/i18n/body-<lang>.json and is fetched only when a language other than English is chosen.
 * The server renders English; after hydration the text switches. Keys are the English text itself and may carry markup:
 * [label](/path or https://...) for links, **bold** for bold, {name} for values passed in `v`.
 * Add or change a key: run `pnpm i18n:body` to list missing translations (scripts/i18n-body.mts).
 */
const cache: Partial<Record<Lang, Record<string, string>>> = {};
const pending: Partial<Record<Lang, Promise<Record<string, string>>>> = {};

function load(lang: Lang): Promise<Record<string, string>> {
  if (cache[lang]) return Promise.resolve(cache[lang]!);
  pending[lang] ??= fetch(`/i18n/body-${lang}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d: Record<string, string>) => (cache[lang] = d));
  return pending[lang]!;
}

/** The body dictionary for the visitor's language (empty for English or while loading). */
export function useBody(): Record<string, string> {
  const lang = useLang();
  const [, bump] = useState(0);
  useEffect(() => {
    if (lang === "en" || cache[lang]) return;
    let off = false;
    load(lang).then(() => { if (!off) bump((n) => n + 1); });
    return () => { off = true; };
  }, [lang]);
  return lang === "en" ? {} : cache[lang] ?? {};
}

const fill = (s: string, v?: Record<string, string | number>) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);

/** Plain translated string (no markup), for attributes such as placeholders and titles. */
export function useBodyT() {
  const d = useBody();
  return (k: string, v?: Record<string, string | number>) => fill(d[k] ?? k, v);
}

/** Renders [label](href) links and **bold** in a translated string. */
export function rich(text: string): ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*)/g);
  return parts.map((s, i) => {
    const m = s.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) {
      const [, label, href] = m;
      if (href.startsWith("/") || href.startsWith("#")) return <Link key={i} href={href} className="text-cyan-400 hover:underline">{label}</Link>;
      if (href.startsWith("https://") || href.startsWith("mailto:")) return <a key={i} href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer" className="text-cyan-400 hover:underline">{label}</a>;
      return <Fragment key={i}>{label}</Fragment>;
    }
    const b = s.match(/^\*\*([^*]+)\*\*$/);
    if (b) return <b key={i} className="text-slate-100">{b[1]}</b>;
    return <Fragment key={i}>{s}</Fragment>;
  });
}

export function TR({ k, v }: { k: string; v?: Record<string, string | number> }) {
  const d = useBody();
  return <>{rich(fill(d[k] ?? k, v))}</>;
}
