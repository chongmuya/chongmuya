"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import type { VerificationState } from "../types/verification.types";

export function ContactVerification({
  label,
  state,
  available,
  onRequest,
  onCheck,
  disabled,
}: {
  label: "이메일" | "휴대폰";
  state: VerificationState;
  available: boolean;
  onRequest: () => void;
  onCheck?: () => void;
  disabled?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.retryAt && !state.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.retryAt, state.expiresAt]);
  const expired =
    state.status === "pending" && !!state.expiresAt && now >= state.expiresAt;
  const status = expired ? "expired" : state.status;
  const waiting = !!state.retryAt && state.retryAt > now;
  const messages = {
    idle: available
      ? `${label} 인증을 요청해 주세요.`
      : `${label} 인증 준비 중`,
    requesting: "인증 요청을 처리하고 있어요.",
    pending: "인증을 진행한 후 결과를 확인해 주세요.",
    verified: `${label} 인증이 완료되었어요.`,
    error: "인증을 확인하지 못했어요. 다시 시도해 주세요.",
    expired: "인증 시간이 만료되었어요. 다시 요청해 주세요.",
  };
  return (
    <div className="mt-2 space-y-2">
      <p role="status" className="text-caption text-muted wrap-anywhere">
        {messages[status]}
      </p>
      {waiting && (
        <p className="text-caption text-muted">
          재요청까지 {Math.max(0, Math.ceil((state.retryAt! - now) / 1000))}초
        </p>
      )}
      {state.expiresAt && status === "pending" && (
        <p className="text-caption text-muted">
          남은 인증 시간{" "}
          {Math.max(0, Math.ceil((state.expiresAt - now) / 1000))}초
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          loading={status === "requesting"}
          disabled={
            disabled ||
            !available ||
            !state.value.trim() ||
            waiting ||
            status === "verified"
          }
          onClick={onRequest}
          className="text-caption"
        >
          {status === "requesting"
            ? "요청 중…"
            : status === "verified"
              ? "인증 완료"
              : `${label} ${status === "idle" ? "인증 요청" : "다시 요청"}`}
        </Button>
        {status === "pending" && onCheck && (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={onCheck}
            className="text-caption"
          >
            {label} 인증 결과 확인
          </Button>
        )}
      </div>
    </div>
  );
}
