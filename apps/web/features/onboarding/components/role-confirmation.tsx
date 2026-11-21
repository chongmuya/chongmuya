"use client";

import Image from "next/image";
import { useId, useRef, type RefObject } from "react";
import { Dialog } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import type { AccountType } from "@/features/auth/types";

export function RoleConfirmation({
  accountType,
  pending,
  error,
  returnFocusRef,
  onCancel,
  onConfirm,
}: {
  accountType: AccountType;
  pending: boolean;
  error?: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
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
      returnFocusRef={returnFocusRef}
      busy={pending}
      onClose={onCancel}
      className="max-w-[322px]"
    >
      <div className="flex flex-col items-center gap-7">
        <h2 id={`${id}-title`} className="text-center text-label text-black">
          {role} 가입하시겠어요?
        </h2>
        {owner ? (
          <div className="relative h-[60px] w-[72px] shrink-0">
            <Image
              src="/images/enrollment/confirm-owner.svg"
              alt=""
              width={72}
              height={64}
              className="absolute -top-[2.25px] left-0"
            />
          </div>
        ) : (
          <div className="relative h-[62.208px] w-[67.921px] shrink-0">
            <Image
              src="/images/enrollment/confirm-organizer.svg"
              alt=""
              width={72}
              height={64}
              className="absolute top-0 -left-[2.255px]"
            />
          </div>
        )}
        <p
          id={`${id}-description`}
          className="w-full max-w-[270px] text-control font-medium break-keep"
        >
          {owner
            ? "사장님은 매장을 등록하고, 단체 예약 문의를 관리할 수 있어요. "
            : "총무는 행사 생성부터 예약, 참석, 정산까지 관리할 수 있어요. "}
          <span className="text-brand">
            가입 후에는 사용자 유형을 변경할 수 없어요.
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
