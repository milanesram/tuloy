import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the checkout root: the Review Queue imports shared core evidence
  // from ../lib, which Turbopack cannot resolve outside its configured root.
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
  // Allow a throwaway build dir (e.g. BUILD_DIST=.next-prod) so a production
  // `next build` can run without clobbering a live `next dev` .next.
  ...(process.env.BUILD_DIST ? { distDir: process.env.BUILD_DIST } : {}),
};

export default nextConfig;
