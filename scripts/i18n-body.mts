/**
 * Body text translations for the visitor pages (see src/components/TR.tsx).
 * Collects every key: <TR k="..."> in src, the help guides (src/data/help.ts) and the updates (src/data/updates.ts),
 * then reports, per language, keys missing from public/i18n/body-<lang>.json.
 *   pnpm i18n:body                 report missing and unused keys
 *   pnpm i18n:body --out <dir>     also write <dir>/missing-<lang>.json (English key -> English text) for translating
 *   pnpm i18n:body --prune         drop unused keys from the language files
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HELP } from "../src/data/help";
import { UPDATES } from "../src/data/updates";

const LANGS = ["es", "fr", "de", "pt", "hi", "ta"];
const keys = new Set<string>();

function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) {
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/<TR\s+k="([^"]+)"/g)) keys.add(m[1]);
      for (const m of s.matchAll(/\b(?:tb|tx)\("([^"]+)"/g)) keys.add(m[1]);
    }
  }
}
walk("src");
for (const sec of HELP) {
  keys.add(sec.title); keys.add(sec.intro);
  for (const g of sec.guides) {
    keys.add(g.title); keys.add(g.summary);
    for (const b of g.body) {
      if ("h" in b) keys.add(b.h);
      else if ("p" in b) keys.add(b.p);
      else if ("tip" in b) keys.add(b.tip);
      else if ("steps" in b) b.steps.forEach((s) => keys.add(s));
      else if ("list" in b) b.list.forEach((s) => keys.add(s));
      else if ("keys" in b) b.keys.forEach(([, v]) => keys.add(v));
    }
  }
}
for (const u of UPDATES) { keys.add(u.title); u.items.forEach((i) => keys.add(i.text)); }

const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
const prune = process.argv.includes("--prune");
if (out && !existsSync(out)) mkdirSync(out, { recursive: true });
console.log(`${keys.size} keys, ${[...keys].join(" ").split(/\s+/).length} words`);
for (const l of LANGS) {
  const f = `public/i18n/body-${l}.json`;
  const d: Record<string, string> = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  const missing = [...keys].filter((k) => !d[k]);
  const unused = Object.keys(d).filter((k) => !keys.has(k));
  console.log(`${l}: ${missing.length} missing, ${unused.length} unused`);
  if (out) writeFileSync(join(out, `missing-${l}.json`), JSON.stringify(Object.fromEntries(missing.map((k) => [k, k])), null, 1));
  if (prune && unused.length) { unused.forEach((k) => delete d[k]); writeFileSync(f, JSON.stringify(d, null, 1) + "\n"); }
}
