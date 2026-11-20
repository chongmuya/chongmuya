"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";

export function PhoneVerificationQr({ qrCode }: { qrCode: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      !window.matchMedia("(hover: none) and (pointer: coarse)").matches,
  );

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="w-full [@media(hover:none)_and_(pointer:coarse)]:hidden"
      >
        QR 코드 보기
      </Button>
      {open && (
        <Dialog
          labelledBy={`${id}-title`}
          describedBy={`${id}-description`}
          initialFocusRef={confirmRef}
          returnFocusRef={triggerRef}
          onClose={() => setOpen(false)}
          className="max-w-[362px] space-y-7 text-center"
        >
          <header className="space-y-2">
            <h2
              id={`${id}-title`}
              className="text-2xl leading-normal font-bold"
            >
              휴대폰 인증
            </h2>
            <p
              id={`${id}-description`}
              className="text-base leading-normal text-copy/80"
            >
              휴대폰으로 QR코드를 스캔한 뒤
              <br />
              문자 앱에서 전송해 주세요.
            </p>
          </header>
          <div className="space-y-4">
            <Image
              src={qrCode}
              alt="휴대폰 문자 앱을 여는 QR 코드"
              width={250}
              height={250}
              unoptimized
              className="mx-auto h-auto max-w-full"
            />
            <p className="text-caption text-muted">
              입력한 번호의 휴대폰을 사용해 주세요.
            </p>
          </div>
          <Button
            ref={confirmRef}
            className="w-full"
            onClick={() => setOpen(false)}
          >
            확인
          </Button>
        </Dialog>
      )}
    </>
  );
}
