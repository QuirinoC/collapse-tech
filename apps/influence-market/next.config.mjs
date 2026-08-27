import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const workspaceRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig = {
  turbopack: {
    // npm workspaces hoist deps to the repo root — tell Turbopack where the workspace starts.
    root: workspaceRoot,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
