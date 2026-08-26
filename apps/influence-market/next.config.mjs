/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // npm workspaces hoist deps to the repo root — tell Turbopack where the workspace starts.
    root: "../..",
  },
};

export default nextConfig;
