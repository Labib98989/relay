import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone/server.js with only the traced
  // runtime files, so the production Docker image needs neither the source tree
  // nor a full `npm install`. See Dockerfile (runner stage).
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
};

export default nextConfig;
