import path from "node:path";
import type { NextConfig } from "next";

// @drsk/shared lives in packages/, outside this app, so the root must be the
// monorepo. Left to inference, the tracked apps/web/package-lock.json makes
// Next pick apps/web, and Turbopack then refuses files above it.
const monorepoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
