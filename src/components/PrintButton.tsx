"use client";
import { useT } from "@/lib/i18n";

export default function PrintButton() {
  const t = useT();
  return <button type="button" onClick={() => window.print()} className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400">{t("Print or save as PDF")}</button>;
}
