import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Server side of the language pages (/hi/..., /ta/...): the body dictionaries (same files as src/components/TR.tsx uses in
 * the browser), plain-string translation for metadata, month and state names. India pages only, for now.
 */
export const PAGE_LANGS = ["hi", "ta"] as const;
/** Languages of the country pages (/es/arrivals/spain ...), see COUNTRY_LANGS. */
export const COUNTRY_PAGE_LANGS = ["es", "pt", "fr", "de"] as const;
export type PageLang = (typeof PAGE_LANGS)[number] | (typeof COUNTRY_PAGE_LANGS)[number] | "en";
// Read from public/i18n at run time (importing six ~300 KB JSON files made type-checking crawl). Cached per process.
const BODY: Record<string, Record<string, string>> = new Proxy({} as Record<string, Record<string, string>>, {
  get(cache, lang: string) {
    if (!(lang in cache)) {
      try { cache[lang] = JSON.parse(readFileSync(join(process.cwd(), "public", "i18n", `body-${lang}.json`), "utf8")); }
      catch { cache[lang] = {}; }
    }
    return cache[lang];
  },
});
export const isPageLang = (l: string): l is Exclude<PageLang, "en"> => (PAGE_LANGS as readonly string[]).includes(l);
/** Only the listed keys, for client components on a language page (the whole dictionary is ~300 KB). */
export const bodyPick = (lang: PageLang, keys: readonly string[]) =>
  (lang === "en" ? {} : Object.fromEntries(keys.filter((k) => k in BODY[lang]).map((k) => [k, BODY[lang][k]])));

/** Translated string with {placeholders} filled, markup kept (rendered by src/components/ServerTr.tsx). */
export function trRaw(lang: PageLang, k: string, v?: Record<string, string | number>) {
  return (lang === "en" ? k : BODY[lang][k] ?? k).replace(/\{(\w+)\}/g, (m, key) => (v && key in v ? String(v[key]) : m));
}
/** The same with markup ([label](href), **bold**) stripped, for metadata and structured data. */
export function tr(lang: PageLang, k: string, v?: Record<string, string | number>) {
  const s = trRaw(lang, k, v);
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}

const LOCALE: Record<PageLang, string> = { en: "en-GB", hi: "hi-IN", ta: "ta-IN", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR" };
export const locale = (lang: PageLang) => LOCALE[lang];
export const months = (lang: PageLang, style: "long" | "short" = "long") =>
  Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2025, i, 15)).toLocaleDateString(LOCALE[lang], { month: style, timeZone: "UTC" }));
/** Counts as people in India write them (4,80,00,000), or "48 million" in English. */
export const fmtCount = (lang: PageLang, n: number) => (lang === "en" ? `${Math.round(n / 1e6)} million` : n.toLocaleString("en-IN"));

/** Indian state and union territory names (keys: slugs of src/lib/indiaStates.ts). */
const STATES: Record<string, [string, string]> = {
  "andaman-and-nicobar-islands": ["अंडमान और निकोबार द्वीपसमूह", "அந்தமான் நிக்கோபார் தீவுகள்"], "andhra-pradesh": ["आंध्र प्रदेश", "ஆந்திரப் பிரதேசம்"],
  "arunachal-pradesh": ["अरुणाचल प्रदेश", "அருணாசலப் பிரதேசம்"], assam: ["असम", "அசாம்"], bihar: ["बिहार", "பீகார்"],
  chandigarh: ["चंडीगढ़", "சண்டிகர்"], chhattisgarh: ["छत्तीसगढ़", "சத்தீஸ்கர்"], goa: ["गोवा", "கோவா"], gujarat: ["गुजरात", "குஜராத்"],
  haryana: ["हरियाणा", "ஹரியானா"], "himachal-pradesh": ["हिमाचल प्रदेश", "இமாச்சலப் பிரதேசம்"], jharkhand: ["झारखंड", "ஜார்க்கண்ட்"],
  karnataka: ["कर्नाटक", "கர்நாடகா"], kerala: ["केरल", "கேரளா"], "madhya-pradesh": ["मध्य प्रदेश", "மத்தியப் பிரதேசம்"],
  maharashtra: ["महाराष्ट्र", "மகாராஷ்டிரா"], manipur: ["मणिपुर", "மணிப்பூர்"], meghalaya: ["मेघालय", "மேகாலயா"], mizoram: ["मिज़ोरम", "மிசோரம்"],
  nagaland: ["नागालैंड", "நாகாலாந்து"], delhi: ["दिल्ली", "டெல்லி"], odisha: ["ओडिशा", "ஒடிசா"], puducherry: ["पुडुचेरी", "புதுச்சேரி"],
  punjab: ["पंजाब", "பஞ்சாப்"], rajasthan: ["राजस्थान", "ராஜஸ்தான்"], sikkim: ["सिक्किम", "சிக்கிம்"], "tamil-nadu": ["तमिलनाडु", "தமிழ்நாடு"],
  telangana: ["तेलंगाना", "தெலங்கானா"], tripura: ["त्रिपुरा", "திரிபுரா"], "uttar-pradesh": ["उत्तर प्रदेश", "உத்தரப் பிரதேசம்"],
  uttarakhand: ["उत्तराखंड", "உத்தராகண்ட்"], "west-bengal": ["पश्चिम बंगाल", "மேற்கு வங்காளம்"],
};
export const stateName = (lang: PageLang, slug: string, en: string) => (lang === "en" ? en : STATES[slug]?.[lang === "hi" ? 0 : 1] ?? en);
export const INDIA_NAME: Record<string, string> = { en: "India", hi: "भारत", ta: "இந்தியா" };

/** hreflang links for a path that exists in English and in every page language. */
export const languageAlternates = (path: string) => ({
  "x-default": path, en: path, ...Object.fromEntries(PAGE_LANGS.map((l) => [l, `/${l}${path}`])),
});

/**
 * Country pages in the country's own language. Each entry is the country slug and "in <country>" as that language says it,
 * because the word before a country name changes with the country (en France / au Canada, in Deutschland / in der Schweiz,
 * no Brasil / em Portugal). Templates on those pages use {in} for it and {place} for the bare name.
 */
export const COUNTRY_LANGS: Record<(typeof COUNTRY_PAGE_LANGS)[number], Record<string, string>> = {
  es: { spain: "en España", mexico: "en México", argentina: "en Argentina", colombia: "en Colombia", chile: "en Chile", peru: "en Perú",
    ecuador: "en Ecuador", "costa-rica": "en Costa Rica", panama: "en Panamá", guatemala: "en Guatemala", honduras: "en Honduras",
    nicaragua: "en Nicaragua", "el-salvador": "en El Salvador", uruguay: "en Uruguay", paraguay: "en Paraguay", venezuela: "en Venezuela",
    cuba: "en Cuba", "dominican-republic": "en la República Dominicana", "puerto-rico": "en Puerto Rico" },
  pt: { brazil: "no Brasil", portugal: "em Portugal" },
  fr: { france: "en France", belgium: "en Belgique", switzerland: "en Suisse", luxembourg: "au Luxembourg", canada: "au Canada",
    morocco: "au Maroc", senegal: "au Sénégal" },
  de: { germany: "in Deutschland", austria: "in Österreich", switzerland: "in der Schweiz", luxembourg: "in Luxemburg" },
};
/** Languages (besides English) with a page for this country. */
export const countryLangs = (slug: string) => COUNTRY_PAGE_LANGS.filter((l) => slug in COUNTRY_LANGS[l]);
/** The country's name in a language (Intl), e.g. "Deutschland", "Brasil". */
export const countryName = (lang: PageLang, iso: string, en: string) =>
  lang === "en" ? en : new Intl.DisplayNames([LOCALE[lang]], { type: "region" }).of(iso) ?? en;
/** Large counts for the country pages: "22.5 million", "2,1 Millionen", else the full number in local grouping. */
export const fmtBig = (lang: PageLang, n: number) => (n >= 1e6 && (lang === "en" || lang === "de")
  ? new Intl.NumberFormat(LOCALE[lang], { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 }).format(n)
  // Spanish, Portuguese and French need "de" after millones/milhões/millions, so they get the full number instead.
  : n.toLocaleString(LOCALE[lang]));
