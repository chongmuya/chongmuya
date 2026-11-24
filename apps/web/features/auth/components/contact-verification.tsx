"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { buttonStyles } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import type {
  VerificationResult,
  VerificationState,
} from "../types/verification.types";
import { PhoneVerificationPrompt } from "./phone-verification-prompt";
import {
  VerificationRequestButton,
  verificationRequestClassName,
} from "./verification-request-button";

const messages = {
  requesting: "인증 요청을 처리하고 있어요.",
  verified: "휴대폰 인증이 완료되었어요.",
  error: "인증을 확인하지 못했어요.",
  expired: "인증 시간이 만료되었어요. 다시 요청해 주세요.",
  idle: undefined,
  pending: undefined,
};

type SmsPlatform = "ios" | "android";

const subscribeToPlatform = () => () => {};

function getSmsPlatform(): SmsPlatform | undefined {
  const { userAgent, maxTouchPoints } = navigator;
  if (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  )
    return "ios";
  if (/Android/.test(userAgent)) return "android";
}

function smsHref(platform: SmsPlatform, receiver: string, message: string) {
  const separator = platform === "ios" ? "&" : "?";
  return `sms:${receiver}${separator}body=${encodeURIComponent(message)}`;
}

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
  onRequest: (onIssued?: (result: VerificationResult) => void) => void;
  onCheck?: () => void;
  disabled?: boolean;
  renderField: (requestButton: ReactNode) => ReactNode;
}) {
  const requestRef = useRef<HTMLButtonElement>(null);
  const [dismissedId, setDismissedId] = useState<string>();
  const smsPlatform = useSyncExternalStore(
    subscribeToPlatform,
    getSmsPlatform,
    () => undefined,
  );
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
        ? smsPlatform
          ? "문자 앱 열기"
          : "인증 다시 열기"
        : "인증 요청";
  const statusMessage =
    exhausted && status === "pending"
      ? "인증을 다시 요청해 주세요."
      : messages[status];

  const requestVerification = () => {
    if (!smsPlatform) {
      if (challenge) setDismissedId(undefined);
      else onRequest();
      return;
    }
    const button = requestRef.current;
    onRequest(({ status, receiver, message }) => {
      if (
        button?.isConnected &&
        document.visibilityState === "visible" &&
        status === "pending" &&
        receiver &&
        message
      )
        window.location.assign(smsHref(smsPlatform, receiver, message));
    });
  };

  return (
    <div>
      {renderField(
        smsPlatform && challenge && available && !disabled && !busy ? (
          <a
            aria-label={`휴대폰 ${requestLabel}`}
            className={buttonStyles({
              className: verificationRequestClassName,
            })}
            href={smsHref(smsPlatform, challenge.receiver, challenge.message)}
          >
            {requestLabel}
          </a>
        ) : (
          <VerificationRequestButton
            ref={requestRef}
            aria-label={`휴대폰 ${requestLabel}`}
            aria-haspopup={verified || smsPlatform ? undefined : "dialog"}
            loading={busy}
            disabled={
              disabled || !available || verified || (!challenge && retryIn > 0)
            }
            onClick={requestVerification}
          >
            {requestLabel}
          </VerificationRequestButton>
        ),
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
      {challenge && (smsPlatform || challenge.id !== dismissedId) && (
        <PhoneVerificationPrompt
          key={challenge.id}
          qrCode={smsPlatform ? undefined : challenge.qrCode}
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
