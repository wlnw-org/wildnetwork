"use client";
import { useEffect, useState } from "react";
import { track } from "@/components/Analytics";
import { useT } from "@/lib/i18n";

const ROLES = [["", "I am a... (optional)"], ["researcher", "Researcher"], ["birder", "Birder or naturalist"], ["educator", "Teacher or educator"], ["station owner", "Station owner"], ["other", "Other"]];

/** "Email me when it arrives near me". The place name is geocoded on the server; only its 5 degree square is kept. */
export default function AlertForm({ species, title, compact = false }: { species: string; title: string; compact?: boolean }) {
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; msg?: string }>({});
  const [place, setPlace] = useState("");
  const t = useT();
  // Suggest the visitor's town from the IP area (editable; nothing is stored until they submit).
  useEffect(() => {
    let live = true;
    fetch("/api/v1/near").then((r) => r.json() as Promise<{ city?: string | null }>).then((n) => { if (live && n.city) setPlace((p) => p || n.city!); }).catch(() => {});
    return () => { live = false; };
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ busy: true });
    const r = await fetch("/api/v1/alerts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "subscribe", species, email: f.get("email"), place: f.get("place"), role: f.get("role") || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) track("alert_subscribe", { species, role: String(f.get("role") || "none") });
    setState({ ok: r.ok, msg: d.message ?? d.error ?? "Something went wrong." });
  }
  if (state.ok) return <p className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-4 text-slate-100">{state.msg}</p>;
  const input = "w-full min-w-0 rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500";
  return (
    <form onSubmit={submit} className={`mt-3 gap-2 ${compact ? "flex flex-col text-sm" : "grid sm:grid-cols-2"}`}>
      <input name="email" type="email" required placeholder={t("Your email")} aria-label={t("Your email")} className={input} />
      <input name="place" required placeholder={t("Your town or city")} aria-label={t("Your town or city")} className={input} value={place} onChange={(e) => setPlace(e.target.value)} />
      <select name="role" aria-label="Who you are (optional)" className={input} defaultValue="">
        {ROLES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
      </select>
      <button disabled={state.busy} className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">
        {state.busy ? t("Sending...") : compact ? t("Email me when it arrives") : t("Email me when the {name} arrives", { name: title })}
      </button>
      {state.msg && <p className="sm:col-span-2 text-sm text-rose-300">{state.msg}</p>}
      <p className="sm:col-span-2 text-xs text-slate-500">
        {t("One email when it arrives in your area after weeks away, never more than once every two months. Confirm by email first; unsubscribe in one click.")}{" "}
        {t("Your address is stored encrypted and used for nothing else.")} <a href="/privacy#alerts" className="text-cyan-400 hover:underline">{t("Privacy")}</a>
      </p>
    </form>
  );
}
