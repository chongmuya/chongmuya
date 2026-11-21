"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { MenuArrow } from "@/shared/ui/menu-link";
import { useAuthActions } from "../hooks/use-auth-actions";

export function LogoutMenuItem() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const keepUsing = useRef<HTMLButtonElement>(null);
  const { logout } = useAuthActions();
  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-control w-full items-center justify-between gap-3 py-2 text-left text-base"
        onClick={() => setOpen(true)}
      >
        로그아웃
        <MenuArrow />
      </button>
      {open && (
        <Dialog
          className="max-w-[322px] text-center"
          labelledBy={`${id}-title`}
          describedBy={`${id}-description`}
          initialFocusRef={keepUsing}
          returnFocusRef={opener}
          busy={logout.isPending}
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col items-center gap-7 pt-[42px]">
            <Image
              src="/images/auth/logout.svg"
              width={57}
              height={57}
              alt=""
            />
            <div className="space-y-2">
              <h2
                id={`${id}-title`}
                className="text-2xl leading-normal font-bold"
              >
                로그아웃 하시겠어요?
              </h2>
              <p
                id={`${id}-description`}
                className="text-base leading-normal break-keep text-black/80"
              >
                로그아웃해도 기록은 그대로 남아 있어요.
                <br />
                다시 로그인하면 이어서 관리할 수 있어요.
              </p>
            </div>
            <div className="grid w-full gap-2">
              <Button
                ref={keepUsing}
                className="text-soft"
                disabled={logout.isPending}
                onClick={() => setOpen(false)}
              >
                계속 이용하기
              </Button>
              <Button
                variant="brand-outline"
                className="border-2 text-brand"
                loading={logout.isPending}
                onClick={() => logout.mutate()}
              >
                로그아웃
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
