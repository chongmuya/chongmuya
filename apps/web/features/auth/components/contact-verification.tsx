"use client";

import { useRef, useState, type ReactNode } from "react";
import { FormError } from "@/shared/ui/form-error";
import type { VerificationState } from "../types/verification.types";
import { PhoneVerificationQr } from "./phone-verification-qr";
import { VerificationRequestButton } from "./verification-request-button";

const messages = {
  requesting: "인증 요청을 처리하고 있어요.",
  verified: "휴대폰 인증이 완료되었어요.",
  error: "인증을 확인하지 못했어요.",
  expired: "인증 시간이 만료되었어요. 다시 요청해 주세요.",
  idle: undefined,
  pending: undefined,
};

export function ContactVerification({
  state,
  now,
  error,
  available,
  onRequest,
  onCheck,
  disabled,
  renderField,
}: {
  state: VerificationState;
  now: number;
  error?: string;
  available: boolean;
  onRequest: () => void;
  onCheck?: () => void;
  disabled?: boolean;
  renderField: (requestButton: ReactNode) => ReactNode;
}) {
  const requestRef = useRef<HTMLButtonElement>(null);
  const [dismissedId, setDismissedId] = useState<string>();
  const { id, status, qrCode, receiver, message } = state;
  const busy = status === "requesting";
  const verified = status === "verified";
  const exhausted = state.checksRemaining === 0;
  const challenge =
    id &&
    qrCode &&
    receiver &&
    message &&
    onCheck &&
    !verified &&
    status !== "expired" &&
    !exhausted
      ? { id, qrCode, receiver, message, onCheck }
      : undefined;
  const retryIn = Math.max(0, Math.ceil(((state.retryAt ?? 0) - now) / 1000));
  const requestLabel = busy
    ? "처리 중…"
    : verified
      ? "인증 완료"
      : challenge
        ? "인증 다시 열기"
        : "인증 요청";
  const statusMessage =
    exhausted && status === "pending"
      ? "인증을 다시 요청해 주세요."
      : messages[status];

  return (
    <div>
      {renderField(
        <VerificationRequestButton
          ref={requestRef}
          aria-label={`휴대폰 ${requestLabel}`}
          aria-haspopup={verified ? undefined : "dialog"}
          loading={busy}
          disabled={
            disabled || !available || verified || (!challenge && retryIn > 0)
          }
          onClick={() => {
            if (challenge) setDismissedId(undefined);
            else onRequest();
          }}
        >
          {requestLabel}
        </VerificationRequestButton>,
      )}
      {!challenge && statusMessage && (
        <p role="status" className="mt-3 text-caption text-muted wrap-anywhere">
          {statusMessage}
        </p>
      )}
      {!challenge && <FormError message={error} />}
      {!challenge && !verified && retryIn > 0 && (
        <p className="mt-3 text-caption text-muted">재요청까지 {retryIn}초</p>
      )}
      {challenge && challenge.id !== dismissedId && (
        <PhoneVerificationQr
          key={challenge.id}
          qrCode={challenge.qrCode}
          receiver={challenge.receiver}
          message={challenge.message}
          remainingSeconds={Math.max(
            0,
            Math.ceil(((state.expiresAt ?? now) - now) / 1000),
          )}
          checkDelaySeconds={Math.max(
            0,
            Math.ceil(((state.nextCheckAt ?? 0) - now) / 1000),
          )}
          checking={busy}
          disabled={disabled}
          error={error}
          onCheck={challenge.onCheck}
          onClose={() => setDismissedId(challenge.id)}
          returnFocusRef={requestRef}
        />
      )}
    </div>
  );
}
