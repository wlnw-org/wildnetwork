import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** The site's share card: a kicker line, a big title and a subtitle, on the dark gradient. */
export function ogCard(kicker: string, title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #020617 0%, #0b2a3a 100%)", color: "#f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: "#7fd320" }} />
          <div style={{ fontSize: 34, color: "#22d3ee", letterSpacing: 2 }}>{kicker}</div>
        </div>
        <div style={{ fontSize: title.length > 24 ? 80 : 104, fontWeight: 700, marginTop: 30, letterSpacing: -3, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 44, marginTop: 20, color: "#cbd5e1", lineHeight: 1.3 }}>{subtitle}</div>
        <div style={{ fontSize: 30, marginTop: 50, color: "#64748b" }}>wlnw.org</div>
      </div>
    ),
    OG_SIZE,
  );
}
