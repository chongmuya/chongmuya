"use client";

import { useEffect, useState } from "react";

type ConnectionStatus = "checking" | "connected" | "failed";

const labels: Record<ConnectionStatus, string> = {
  checking: "API 연결 확인 중…",
  connected: "API 연결 성공",
  failed: "API 연결 실패",
};

export function HealthStatus() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;

    async function checkHealth() {
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 3_000);

      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw new Error("Health request failed");

        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          body === null ||
          !("status" in body) ||
          body.status !== "ok" ||
          !("service" in body) ||
          body.service !== "chongmuya-api"
        ) {
          throw new Error("Invalid health response");
        }

        if (active) setStatus("connected");
      } catch {
        if (active) setStatus("failed");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkHealth();
    const interval = window.setInterval(() => void checkHealth(), 5_000);

    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, []);

  return <p role="status" aria-live="polite">{labels[status]}</p>;
}
