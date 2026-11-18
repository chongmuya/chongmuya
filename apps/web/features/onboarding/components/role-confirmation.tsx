"use client";

import Image from "next/image";
import { useId, useRef } from "react";
import { Dialog } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import type { AccountType } from "@/features/auth/types";

export function RoleConfirmation({
  accountType,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  accountType: AccountType;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const owner = accountType === "owner";
  const role = owner ? "사장님으로" : "총무로";
  return (
    <Dialog
      labelledBy={`${id}-title`}
      describedBy={`${id}-description`}
      initialFocusRef={cancel}
      busy={pending}
      onClose={onCancel}
      className="max-w-[322px]"
    >
      <div className="flex flex-col items-center gap-7">
        <h2 id={`${id}-title`} className="text-center text-label text-black">
          {role} 계속하시겠어요?
        </h2>
        {owner ? (
          <div className="relative h-[60px] w-[72px] shrink-0">
            <Image
              src="/images/enrollment/confirm-owner.svg"
              alt=""
              width={72.1323}
              height={64.5}
              className="absolute -top-[2.25px] left-0"
            />
          </div>
        ) : (
          <div className="relative h-[62.208px] w-[67.921px] shrink-0">
            <Image
              src="/images/enrollment/confirm-organizer.svg"
              alt=""
              width={72.4304}
              height={64.4585}
              className="absolute top-0 -left-[2.255px]"
            />
          </div>
        )}
        <p
          id={`${id}-description`}
          className="w-full max-w-[270px] text-control font-medium"
        >
          {owner
            ? "사장님은 매장을 운영하는 분을 위한 유형이에요. 매장 등록과 예약 문의 관리는 준비 중이에요. "
            : "총무는 모임과 행사를 준비하는 유형이에요. 예약 문의와 참석 관리를 사용할 수 있어요. 정산은 준비 중이에요. "}
          <span className="text-brand">
            선택한 사용자 유형은 이후 변경할 수 없어요.
          </span>
        </p>
        <div className="w-full">
          <FormError message={error} />
          <Button
            variant="brand-outline"
            className="w-full border-2"
            loading={pending}
            onClick={onConfirm}
          >
            {pending ? "저장 중…" : `${role} 계속하기`}
          </Button>
          <Button
            ref={cancel}
            variant="brand-outline"
            className="w-full border-transparent text-muted"
            disabled={pending}
            onClick={onCancel}
          >
            닫기
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
