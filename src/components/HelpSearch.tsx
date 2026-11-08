"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface HelpItem { href: string; title: string; summary: string; section: string; text: string }

/** Instant search over every guide's title, summary and text. */
export default function HelpSearch({ items }: { items: HelpItem[] }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return [];
    return items.map((it) => {
      const t = it.title.toLowerCase(), all = `${t} ${it.summary.toLowerCase()} ${it.text}`;
      if (!words.every((w) => all.includes(w))) return null;
      return { it, score: words.filter((w) => t.includes(w)).length * 3 + words.filter((w) => it.summary.toLowerCase().includes(w)).length };
    }).filter((x): x is { it: HelpItem; score: number } => !!x).sort((a, b) => b.score - a.score).slice(0, 8);
  }, [q, items]);
  return (
    <div className="mt-6">
      <input value={q} onChange={(e) => setQ(e.target.value)} type="search" autoFocus placeholder="What do you need help with? For example: add recordings, export to GBIF, alerts"
        aria-label="Search the guides" className="w-full rounded-lg border border-white/15 bg-slate-900 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none" />
      {q.trim().length > 1 && (
        <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10 bg-white/5">
          {hits.length ? hits.map(({ it }) => (
            <li key={it.href}><Link href={it.href} className="block px-4 py-3 hover:bg-white/5">
              <span className="text-xs text-slate-400">{it.section}</span>
              <span className="block font-medium text-slate-100">{it.title}</span>
              <span className="block text-sm text-slate-400">{it.summary}</span>
            </Link></li>
          )) : <li className="px-4 py-3 text-sm text-slate-400">Nothing found. Try other words, or <Link href="/feedback" className="text-cyan-400 hover:underline">ask us</Link>.</li>}
        </ul>
      )}
    </div>
  );
}
