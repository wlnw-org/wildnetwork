import type { NextConfig } from "next";

// Map tiles come from OpenFreeMap, analytics from Google; species photos and device media can be on any https host.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "font-src 'self' data:",
  "connect-src 'self' https://tiles.openfreemap.org https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const CANONICAL = "https://wlnw.org";

const nextConfig: NextConfig = {
  // Connectors read the sensitive taxa list at runtime.
  outputFileTracingIncludes: { "/api/**": ["./scripts/sensitive_species.txt"] },
  // The site moved from wildnetwork.arunrajiah.com to wlnw.org on 2026-10-23. Pages on the old host redirect
  // permanently. /api/ and /agent/ keep answering there, because installed wdx-agents and the BirdEcho app
  // POST to the old host and most HTTP clients drop the body (or fail) when a POST is redirected.
  async redirects() {
    return [
      { source: "/:path*", has: [{ type: "host", value: "www.wlnw.org" }], destination: `${CANONICAL}/:path*`, permanent: true },
      { source: "/:path((?!api/|agent/).*)", has: [{ type: "host", value: "wildnetwork.arunrajiah.com" }], destination: `${CANONICAL}/:path`, permanent: true },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
