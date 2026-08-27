/** @type {import('next').NextConfig} */
const nextConfig = {
  // npm workspaces hoist deps to the repo root; without this Turbopack
  // mis-detects the root (stray app-level lockfile) and fails module resolution.
  turbopack: {
    root: "../..",
  },
  // `pg` conditionally requires `pg-cloudflare` at runtime; the file tracer can't
  // see through the conditional, so include it explicitly. npm workspaces hoist
  // pg-cloudflare to the repo root, so the glob must reach up two levels.
  outputFileTracingIncludes: {
    "**/*": [
      "../../node_modules/pg-cloudflare/dist/**",
      "../../node_modules/pg-cloudflare/esm/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
