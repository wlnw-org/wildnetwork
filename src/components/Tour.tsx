"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "./Analytics";
import { useT } from "@/lib/i18n";

/**
 * First-visit walkthrough of the map. It opens by asking what kind of visitor this is (optional, one tap or Skip), then
 * walks through the common features and ends on the ones that matter for that role. Each step points at an element
 * marked data-tour="…"; a step whose element is not visible (phone layouts hide some) is skipped. Remembered in
 * localStorage; the About panel can replay it. The role is kept in this browser and sent to analytics as an event only.
 */
export const TOUR_KEY = "wn_tour_v2";
export const ROLE_KEY = "wn_role";
export type Role = "nature" | "station" | "researcher" | "educator";
export const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: "nature", label: "Nature lover or birder", hint: "See what is around and get alerts" },
  { key: "station", label: "I run a recorder", hint: "Or want to: BirdNET, bat or camera" },
  { key: "researcher", label: "Researcher", hint: "Data, methods, study areas" },
  { key: "educator", label: "Teacher or student", hint: "Learn and use it in class" },
];

/** text is a list of pieces, each translated on its own (the rail step adds a sentence only when Ask is on). */
interface Step { target: string | null; title: string; text: string[]; place: "center" | "bottom" | "right" | "top"; roles?: true }

export function tourSteps(askEnabled: boolean, role: Role | null): Step[] {
  const common: Step[] = [
    { target: null, place: "center", title: "Welcome to Wildlife Network", text: ["What brings you here? Pick one and the tour shows what matters most to you."], roles: true },
    { target: null, place: "center", title: "A live map of wildlife",
      text: ["Wildlife Network shows where birds, bats and other animals are right now, from thousands of community stations and observers. Each dot is a recent detection: blue from BirdWeather stations, amber from GBIF, green from iNaturalist, pink from devices sending directly."] },
    { target: "search", place: "bottom", title: "Find a species or a place",
      text: ["Type a species to see where it is heard and seen, how its range is shifting and when it arrives. Type a town to fly there and see what arrived nearby, what is expected next and what is recorded most."] },
    { target: "classes", place: "bottom", title: "Birds, bats, insects, amphibians",
      text: ["Switch the animal class. Every measure is worked out per class, so a sparse group is not drowned out by birds."] },
    { target: "slider", place: "top", title: "Live or the past",
      text: ["1h and 3h show single detections as they come in. 7d, 30d and 12m show the past week, month or year per area: click an area's icon for its top species. With a species open, Play year shows its movement week by week."] },
    { target: "rail", place: "right", title: "Now, Feed, Research and more",
      text: ["Now shows what is changing: species moving, surging or fading, and the latest arrivals. Feed lists the newest detections.", ...(askEnabled ? [" Ask answers questions in plain words from the same data."] : []), " Research and Methods explain how every number is made. About has the sources, credits and privacy notes."] },
  ];
  const byRole: Record<Role | "none", Step[]> = {
    nature: [
      { target: "lang", place: "bottom", title: "Alerts and your language",
        text: ["Open any species and press \"Alert me when it arrives near me\" to get one email when it turns up in your area. The menu here switches the language."] },
    ],
    station: [
      { target: "contribute", place: "right", title: "Add your own station",
        text: ["A BirdNET-Pi, BirdNET-Go, camera trap, bat detector or a Wildlife Network Base can send its detections here. Everything is open: the methods, the data downloads and the API."] },
    ],
    researcher: [
      { target: "research", place: "right", title: "For researchers",
        text: ["Sign in with ORCID to draw a study area with a live dashboard and weekly digest, review arrival estimates you know, and start from ready-made Python and R code. Open data releases have DOIs, and the API is free."] },
    ],
    educator: [
      { target: "research", place: "right", title: "For classes and projects",
        text: ["Every number has a plain explanation under Methods, the data downloads are free, and a cheap recorder lets a school add its own station. Try a place report for your town."] },
    ],
    none: [
      { target: "contribute", place: "right", title: "Add your own station",
        text: ["A BirdNET-Pi, BirdNET-Go, camera trap, bat detector or a Wildlife Network Base can send its detections here. Everything is open: the methods, the data downloads and the API."] },
    ],
  };
  return [...common, ...byRole[role ?? "none"]];
}

const PAD = 8;
const CARD_W = 320;

function visibleRect(target: string | null): DOMRect | null {
  if (!target) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

export default function Tour({ open, auto, askEnabled, onClose }: { open: boolean; auto: boolean; askEnabled: boolean; onClose: () => void }) {
  const t = useT();
  const [role, setRole] = useState<Role | null>(() => {
    try { return (localStorage.getItem(ROLE_KEY) as Role | null) ?? null; } catch { return null; }
  });
  const steps = tourSteps(askEnabled, role);
  const chooseRole = (r: Role) => {
    setRole(r);
    try { localStorage.setItem(ROLE_KEY, r); } catch {}
    track("select_role", { role: r });
    setI(1);
  };
  const [i, setI] = useState(0);
  // Re-rendered on resize so the spotlight follows the element; the rect itself is read from the DOM while rendering.
  const [, setTick] = useState(0);

  const finish = useCallback((how: string) => {
    try { localStorage.setItem(TOUR_KEY, "done"); } catch {}
    track("tour_end", { how, step: i + 1 });
    onClose();
  }, [i, onClose]);

  // Steps whose element is hidden on this screen size are skipped in the direction of travel.
  const go = useCallback((dir: 1 | -1) => {
    let n = i + dir;
    while (n >= 0 && n < steps.length && steps[n].target && !visibleRect(steps[n].target)) n += dir;
    if (n >= steps.length) return finish("done");
    if (n < 0) return;
    setI(n);
  }, [i, steps, finish]);

  useEffect(() => { if (open) track("tour_start", { auto: auto ? 1 : 0 }); }, [open, auto]);
  useEffect(() => {
    if (!open) return;
    const onResize = () => setTick((t) => t + 1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish("skip");
      else if (e.key === "ArrowRight" || e.key === "Enter") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey); };
  }, [open, go, finish]);
  if (!open) return null;
  const step = steps[i];
  const rect = visibleRect(step.target);
  const vw = window.innerWidth, vh = window.innerHeight;
  let cardStyle: React.CSSProperties;
  if (!rect || step.place === "center") {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  } else if (step.place === "bottom") {
    cardStyle = { left: Math.min(Math.max(12, rect.left), vw - CARD_W - 12), top: rect.bottom + PAD + 8 };
  } else if (step.place === "right") {
    cardStyle = { left: Math.min(rect.right + PAD + 8, vw - CARD_W - 12), top: Math.min(Math.max(12, rect.top), vh - 220) };
  } else {
    cardStyle = { left: Math.min(Math.max(12, rect.left), vw - CARD_W - 12), bottom: vh - rect.top + PAD + 8 };
  }
  const last = i === steps.length - 1;

  return (
    <div className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label={t("Welcome tour")}>
      {rect ? (
        <div className="absolute rounded-lg pointer-events-none" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD, boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)", outline: "2px solid rgba(34, 211, 238, 0.9)" }} />
      ) : (
        <div className="absolute inset-0 bg-slate-950/75" />
      )}
      <div className="absolute rounded-xl bg-slate-900 border border-white/15 shadow-2xl p-4 text-slate-100" style={{ width: Math.min(CARD_W, vw - 24), ...cardStyle }}>
        <div className="text-[11px] uppercase tracking-wider text-slate-400">{t("{i} of {n}", { i: i + 1, n: steps.length })}</div>
        <h2 className="mt-1 text-base font-semibold">{t(step.title)}</h2>
        <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{step.text.map((x) => t(x)).join("")}</p>
        {step.roles && (
          <div className="mt-3 grid gap-1.5">
            {ROLES.map((r) => (
              <button key={r.key} onClick={() => chooseRole(r.key)}
                className={`text-left rounded-lg border px-3 py-2 hover:border-cyan-400/70 hover:bg-white/5 ${role === r.key ? "border-cyan-400 bg-cyan-400/10" : "border-white/15"}`}>
                <span className="block text-sm font-medium">{t(r.label)}</span>
                <span className="block text-xs text-slate-400">{t(r.hint)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => go(1)} className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400">{last ? t("Start exploring") : t("Next")}</button>
          {i > 0 && <button onClick={() => go(-1)} className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">{t("Back")}</button>}
          <span className="flex-1" />
          {!last && <button onClick={() => finish("skip")} className="text-sm text-slate-400 hover:text-white">{t("Skip")}</button>}
        </div>
      </div>
    </div>
  );
}
