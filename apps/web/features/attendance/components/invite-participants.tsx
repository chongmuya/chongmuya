"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";

export function InviteParticipants({
  shareId,
  roundTitle,
  onClose,
}: {
  shareId: string;
  roundTitle: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [url] = useState(
    () => new URL(`/attendance/${shareId}`, window.location.origin).href,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  return (
    <Dialog
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onClose}
      className="max-w-[362px] space-y-7 text-center"
    >
      <header className="space-y-2">
        <h2 id={titleId} className="text-2xl leading-normal font-bold">
          참여자 초대
        </h2>
        <p id={descriptionId} className="text-base leading-normal text-copy/80">
          QR코드를 스캔한 뒤 이름과 전화번호 뒤
          <br />
          4자리를 입력해 주세요.
        </p>
      </header>
      <div className="mx-auto w-full max-w-[250px]">
        <QRCodeSVG
          value={url}
          size={250}
          marginSize={4}
          title={`${roundTitle} 참석 응답 QR`}
          className="h-auto max-w-full"
        />
        <button
          type="button"
          className="mt-2 ml-auto flex min-h-control cursor-pointer items-center justify-end gap-2 rounded-control px-3 text-sm font-semibold text-secondary"
          onClick={() => void copyLink()}
        >
          <Image
            src="/images/attendance/copy-link.svg"
            alt=""
            width={25.5}
            height={25.5}
          />
          <span aria-live="polite">
            {copyState === "copied" ? "복사 완료" : "링크 복사"}
          </span>
        </button>
      </div>
      {copyState === "failed" && (
        <div role="status" className="space-y-2 text-sm text-secondary">
          <p>아래 링크를 길게 눌러 복사해 주세요.</p>
          <a href={url} className="block break-all text-link underline">
            {url}
          </a>
        </div>
      )}
      <Button className="w-full" onClick={onClose}>
        확인
      </Button>
    </Dialog>
  );
}
