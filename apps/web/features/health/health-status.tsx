"use client";

import { useQuery } from "@tanstack/react-query";
import { healthQueryOptions } from "./queries";

export function HealthStatus() {
  const query = useQuery(healthQueryOptions);
  // A failed refetch can retain old data. Current errors must take precedence.
  const label = query.isError
    ? "API 연결 실패"
    : query.isPending ? "API 연결 확인 중…" : "API 연결 성공";
  return <p role="status" aria-live="polite">{label}</p>;
}
