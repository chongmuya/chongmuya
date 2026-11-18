import type { NextConfig } from "next";

import { apiOrigin } from "./shared/http/api-origin";

apiOrigin();

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      // Do not log codes from stale console redirects, even though this route is now 404.
      ignore: [/^\/auth\/reset-password/, /^\/api\/v1\/auth\/kakao\/callback/],
    },
  },
  async headers() {
    return [
      "/auth/reset-password",
      "/auth/kakao/:path*",
      "/merchant-reply",
    ].map((source) => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
      ],
    }));
  },
};

export default nextConfig;
