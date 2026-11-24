"use client";

import Image from "next/image";
import { useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { FormError } from "@/shared/ui/form-error";

export function PhoneVerificationPrompt({
  qrCode,
  remainingSeconds,
  checkDelaySeconds,
  checking,
  disabled,
  error,
  onCheck,
  onClose,
  returnFocusRef,
}: {
  qrCode?: string;
  remainingSeconds: number;
  checkDelaySeconds: number;
  checking: boolean;
  disabled?: boolean;
  error?: string;
  onCheck: () => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const remainingTime = (
    <p className="text-caption text-muted">
      남은 인증 시간 {remainingSeconds}초
    </p>
  );
  const checkControls = (
    <div className="space-y-2">
      <FormError message={error} />
      {hasChecked && !checking && !error && (
        <p role="status" className="text-caption text-muted">
          아직 문자가 확인되지 않았어요. 잠시 후 다시 눌러 주세요.
        </p>
      )}
      {checkDelaySeconds > 0 && (
        <p className="text-caption text-muted">
          {checkDelaySeconds}초 후 확인할 수 있어요.
        </p>
      )}
      <Button
        className="w-full"
        variant={qrCode ? "solid" : "outline"}
        loading={checking}
        disabled={disabled || checkDelaySeconds > 0}
        onClick={() => {
          setHasChecked(true);
          onCheck();
        }}
      >
        {checking ? "확인 중…" : "문자 보냈어요"}
      </Button>
    </div>
  );

  if (!qrCode)
    return (
      <div className="mt-3 space-y-2">
        <p className="text-caption text-muted">
          문자 앱에서 채워진 문구를 전송해 주세요.
        </p>
        {remainingTime}
        {checkControls}
      </div>
    );

  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-description`}
      initialFocusRef={titleRef}
      returnFocusRef={returnFocusRef}
      busy={checking}
      showCloseButton
      onClose={onClose}
      className="max-w-[362px] space-y-4 text-center"
    >
      <header className="space-y-2">
        <h2
          id={`${id}-title`}
          ref={titleRef}
          tabIndex={-1}
          className="text-2xl leading-normal font-bold"
        >
          휴대폰 인증
        </h2>
        <p
          id={`${id}-description`}
          className="text-base leading-normal text-copy/80"
        >
          문자 앱을 열고 채워진 문구를 전송해 주세요.
        </p>
      </header>
      <div className="space-y-2">
        <p className="text-caption text-muted">
          입력한 번호의 휴대폰으로 QR 코드를 스캔할 수 있어요.
        </p>
        <Image
          src={qrCode}
          alt="휴대폰 문자 앱을 여는 QR 코드"
          width={250}
          height={250}
          unoptimized
          className="mx-auto h-auto max-w-full"
        />
        <p className="text-caption text-muted">
          요금제에 따라 문자 요금이 발생할 수 있어요.
        </p>
        {remainingTime}
      </div>
      {checkControls}
    </Dialog>
  );
}
