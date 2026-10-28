"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MESSAGES } from "@/lib/messages";

/**
 * Interface languages for the map. Keys are the English text itself, so a string without a translation simply shows in
 * English. The choice comes from the browser language on first visit and is remembered in localStorage; the server
 * always renders English (hydration then switches), and pages such as /methods and /privacy stay English on purpose.
 */
export const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];

const KEY = "wn_lang";
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang;
  } catch {}
  for (const n of navigator.languages ?? [navigator.language]) {
    const code = n.slice(0, 2).toLowerCase();
    if (LANGS.some((l) => l.code === code)) return code as Lang;
  }
  return "en";
}

let current: Lang | null = null;
const getLang = (): Lang => (current ??= detect());

export function setLang(lang: Lang) {
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch {}
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Translate English text; {name} placeholders are filled from vars after translation. */
export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  let out = (lang !== "en" && MESSAGES[lang]?.[text]) || text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "en");
}

export function useT() {
  const lang = useLang();
  return (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars);
}

/**
 * Common names in the visitor's language for the given scientific names (/api/v1/names), English when there is none.
 * Returns a lookup: local(name, english) -> display name.
 */
export function useLocalNames(list: string[]): (sci: string, en: string | null) => string {
  const lang = useLang();
  const key = lang === "en" ? "" : [...new Set(list)].sort().join(",");
  const [names, setNames] = useState<{ key: string; map: Record<string, Record<string, string>> }>({ key: "", map: {} });
  useEffect(() => {
    if (!key) return;
    let off = false;
    fetch(`/api/v1/names?names=${encodeURIComponent(key)}`).then((r) => r.json()).then((m) => { if (!off) setNames({ key, map: m }); }).catch(() => {});
    return () => { off = true; };
  }, [key]);
  return (sci, en) => (lang !== "en" && names.key === key ? names.map[sci]?.[lang] : undefined) ?? en ?? sci;
}
