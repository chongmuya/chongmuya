"use client";

import Image from "next/image";
import { Button, buttonStyles } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import type { VerificationState } from "../types/verification.types";

export function ContactVerification({
  state,
  now,
  error,
  available,
  onRequest,
  onCheck,
  disabled,
}: {
  label: "휴대폰";
  state: VerificationState;
  now: number;
  error?: string;
  available: boolean;
  onRequest: () => void;
  onCheck?: () => void;
  disabled?: boolean;
}) {
  const waiting = (state.retryAt ?? 0) > now;
  const checkWaiting = (state.nextCheckAt ?? 0) > now;
  const status = state.status;
  const messages = {
    idle: "휴대폰 인증을 시작해 주세요.",
    requesting: "인증 요청을 처리하고 있어요.",
    pending: "문자를 전송한 뒤 아래에서 인증 결과를 확인해 주세요.",
    verified: "휴대폰 인증이 완료되었어요.",
    error: "인증을 확인하지 못했어요.",
    expired: "인증 시간이 만료되었어요. 다시 요청해 주세요.",
  };
  return (
    <div className="mt-3 space-y-3">
      <p role="status" className="text-caption text-muted wrap-anywhere">
        {messages[status]}
      </p>
      <FormError message={error} />
      {state.expiresAt && status !== "expired" && (
        <p className="text-caption text-muted">
          남은 인증 시간{" "}
          {Math.max(0, Math.ceil((state.expiresAt - now) / 1000))}초
        </p>
      )}
      {state.message &&
        state.receiver &&
        status !== "expired" &&
        status !== "verified" && (
          <div className="space-y-4 rounded-panel border border-border p-4">
            {state.qrCode && (
              <div className="space-y-3 text-center [@media(hover:none)_and_(pointer:coarse)]:hidden">
                <p className="text-control font-semibold">
                  휴대폰으로 QR을 스캔해 주세요
                </p>
                <Image
                  src={state.qrCode}
                  alt="휴대폰 문자 앱을 여는 QR 코드"
                  width={200}
                  height={200}
                  unoptimized
                  className="mx-auto rounded-control bg-white p-3"
                />
                <p className="text-caption text-muted">
                  입력한 번호의 휴대폰 카메라로 스캔한 뒤,
                  <br />
                  열린 문자 앱에서 전송해 주세요.
                </p>
              </div>
            )}
            <div className="hidden space-y-3 [@media(hover:none)_and_(pointer:coarse)]:block">
              <p className="text-caption text-muted">
                아래 버튼으로 문자 앱을 열고, 채워진 문구를 전송해 주세요.
              </p>
              <a
                onClick={(event) => {
                  if (/iPad|iPhone|iPod/.test(navigator.userAgent))
                    event.currentTarget.href = `sms:${state.receiver}&body=${encodeURIComponent(state.message!)}`;
                }}
                href={`sms:${state.receiver}?body=${encodeURIComponent(state.message)}`}
                className={buttonStyles({ className: "w-full" })}
              >
                문자 앱 열기
              </a>
            </div>
            <details className="border-t border-border pt-3">
              <summary className="cursor-pointer text-caption text-muted">
                번호·문구 직접 확인
              </summary>
              <div className="mt-3 space-y-2 text-caption">
                <p>
                  수신 번호{" "}
                  <strong className="select-all">{state.receiver}</strong>
                </p>
                <p>전송 문구</p>
                <p className="select-all rounded-control bg-surface p-2 break-all">
                  {state.message}
                </p>
              </div>
            </details>
            <p className="text-caption text-muted">
              사용 중인 요금제에 따라 문자 요금이 발생할 수 있어요.
            </p>
          </div>
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
            ? "처리 중…"
            : status === "verified"
              ? "인증 완료"
              : state.id
                ? "새 인증 요청"
                : "휴대폰 인증 요청"}
        </Button>
        {state.id &&
          !["idle", "verified", "expired", "requesting"].includes(status) &&
          onCheck && (
            <Button
              variant="outline"
              disabled={disabled || checkWaiting || state.checksRemaining === 0}
              onClick={onCheck}
              className="text-caption"
            >
              인증 결과 확인
            </Button>
          )}
      </div>
      {waiting && status !== "verified" && (
        <p className="text-caption text-muted">
          재요청까지 {Math.max(0, Math.ceil((state.retryAt! - now) / 1000))}초
        </p>
      )}
      {state.id && status !== "verified" && status !== "expired" && (
        <p className="text-caption text-muted">
          확인 가능 횟수 {state.checksRemaining ?? 0}회
          {checkWaiting
            ? ` · ${Math.ceil((state.nextCheckAt! - now) / 1000)}초 후 다시 확인`
            : ""}
        </p>
      )}
    </div>
  );
}
