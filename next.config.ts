import type { NextConfig } from "next";

// Local-only UI. Jobs live in $CLIPPER_HOME (default ~/MotionMindClipper) and are read at request time.
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
};

export default nextConfig;
