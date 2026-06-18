import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse reads test files from disk at import time — must stay external
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
