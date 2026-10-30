import type { NextConfig } from "next";

const apiUrl = new URL(process.env.API_URL ?? "http://127.0.0.1:3001");

if (!["http:", "https:"].includes(apiUrl.protocol)) {
  throw new Error("API_URL must be an HTTP or HTTPS URL.");
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: new URL("/api/v1/:path*", apiUrl).toString(),
      },
      {
        source: "/api/health",
        destination: new URL("/health", apiUrl).toString(),
      },
    ];
  },
};

export default nextConfig;
