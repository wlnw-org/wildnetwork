import hi from "../../public/i18n/body-hi.json";
import ta from "../../public/i18n/body-ta.json";

/**
 * Server side of the language pages (/hi/..., /ta/...): the body dictionaries (same files as src/components/TR.tsx uses in
 * the browser), plain-string translation for metadata, month and state names. India pages only, for now.
 */
export const PAGE_LANGS = ["hi", "ta"] as const;
export type PageLang = (typeof PAGE_LANGS)[number] | "en";
const BODY: Record<string, Record<string, string>> = { hi, ta };
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

const LOCALE: Record<PageLang, string> = { en: "en-GB", hi: "hi-IN", ta: "ta-IN" };
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
export const INDIA_NAME: Record<PageLang, string> = { en: "India", hi: "भारत", ta: "இந்தியா" };

/** hreflang links for a path that exists in English and in every page language. */
export const languageAlternates = (path: string) => ({
  "x-default": path, en: path, ...Object.fromEntries(PAGE_LANGS.map((l) => [l, `/${l}${path}`])),
});
