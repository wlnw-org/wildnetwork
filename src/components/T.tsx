"use client";
import { LANGS, setLang, useLang, useT, type Lang } from "@/lib/i18n";

/**
 * Translated text for server-rendered pages (species, places): the server sends English, and after hydration the text
 * switches to the visitor's language like the map does. `names` swaps a species' common name ({name}) for its name in
 * that language from the BirdNET+ taxonomy (species_media.names).
 */
export function T({ k, v, names }: { k: string; v?: Record<string, string | number>; names?: Record<string, string> | null }) {
  const t = useT();
  const lang = useLang();
  const vars = v && names?.[lang] && "name" in v ? { ...v, name: names[lang] } : v;
  return <>{t(k, vars)}</>;
}

/** A species' common name in the visitor's language when the taxonomy has one, else the English name. */
export function LocalName({ en, names }: { en: string; names?: Record<string, string> | null }) {
  const lang = useLang();
  return <>{names?.[lang] ?? en}</>;
}

/** Language menu for pages outside the map (same choice, remembered for the map too). */
export function PageLang() {
  const lang = useLang();
  const t = useT();
  return (
    <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("Language")}
      className="rounded-md bg-white/10 px-1.5 py-1 text-xs text-slate-200 outline-none">
      {LANGS.map((l) => <option key={l.code} value={l.code} className="text-slate-900">{l.label}</option>)}
    </select>
  );
}
