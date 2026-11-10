import Link from "next/link";
import type { Block } from "@/data/help";
import { TR } from "@/components/TR";

/** Text with [label](/path) links. Only site paths and https links are made into links. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)\s]+\))/g);
  return <>{parts.map((s, i) => {
    const m = s.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (!m) return s;
    const [, label, href] = m;
    if (href.startsWith("/")) return <Link key={i} href={href} className="text-cyan-400 hover:underline">{label}</Link>;
    if (href.startsWith("https://")) return <a key={i} href={href} className="text-cyan-400 hover:underline">{label}</a>;
    return label;
  })}</>;
}

export function HelpBody({ body }: { body: Block[] }) {
  return <div className="space-y-4">{body.map((b, i) => {
    if ("h" in b) return <h2 key={i} id={b.h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")} className="scroll-mt-6 pt-2 text-xl font-semibold text-slate-100"><TR k={b.h} /></h2>;
    if ("p" in b) return <p key={i}><TR k={b.p} /></p>;
    if ("steps" in b) return <ol key={i} className="list-decimal space-y-2 pl-6 marker:text-cyan-400">{b.steps.map((s) => <li key={s}><TR k={s} /></li>)}</ol>;
    if ("list" in b) return <ul key={i} className="list-disc space-y-1.5 pl-6">{b.list.map((s) => <li key={s}><TR k={s} /></li>)}</ul>;
    if ("tip" in b) return <p key={i} className="rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-sm"><b className="text-cyan-300"><TR k="Tip:" /> </b><TR k={b.tip} /></p>;
    return (
      <table key={i} className="text-sm"><tbody>{b.keys.map(([k, v]) => (
        <tr key={k}><td className="py-1 pr-4"><kbd className="rounded border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-slate-100">{k}</kbd></td><td><TR k={v} /></td></tr>
      ))}</tbody></table>
    );
  })}</div>;
}
