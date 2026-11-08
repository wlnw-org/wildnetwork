import Link from "next/link";

/** Small "How this works" link to the guide for the page it sits on. */
export default function HelpLink({ to, label = "How this works" }: { to: string; label?: string }) {
  return (
    <Link href={to} className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:underline print:hidden">
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></svg>
      {label}
    </Link>
  );
}
