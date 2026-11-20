"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { usePageVisible } from "@/shared/hooks/use-page-visible";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { isAccessError } from "@/shared/http/access-error";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { reservationContactQuery } from "../api/completion.api";
import type { CompletionAccess } from "../types/completion.types";

export function ReservationContactButton({
  id,
  access,
  onAccessLost,
}: {
  id: string;
  access: CompletionAccess;
  onAccessLost: (lost: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const title = access.kind === "organizer" ? "매장 연락처" : "총무 정보";
  const organizer = access.kind === "organizer";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          organizer
            ? "relative inline-flex items-center gap-1 text-xs leading-[normal] text-secondary underline underline-offset-2 before:absolute before:inset-x-0 before:-inset-y-3.5"
            : "mx-auto block min-h-11 text-sm text-muted"
        }
      >
        {organizer && (
          <Image
            src="/images/reservations/phone.svg"
            width={12.2114}
            height={12.2114}
            alt=""
          />
        )}
        {organizer ? "매장 연락처 확인하기" : "총무에게 문의하기"}
      </button>
      {open && (
        <Dialog
          labelledBy={titleId}
          dismissOnBackdrop
          onClose={() => setOpen(false)}
          className="relative mx-auto mt-auto mb-0 min-h-[198px] w-full max-w-[402px] rounded-t-[24px] rounded-b-none px-0 pt-9 pb-[max(28px,env(safe-area-inset-bottom))]"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-x-0 top-0 flex h-8 w-full justify-center pt-2"
          >
            <span className="h-1 w-11 rounded bg-[#dedede]" />
          </button>
          <h2 id={titleId} className="px-10 text-xl font-semibold text-black">
            {title}
          </h2>
          <div className="mt-2.5 px-10">
            <ContactContent
              id={id}
              access={access}
              onAccessLost={onAccessLost}
            />
          </div>
        </Dialog>
      )}
    </>
  );
}

function ContactContent({
  id,
  access,
  onAccessLost,
}: {
  id: string;
  access: CompletionAccess;
  onAccessLost: (lost: boolean) => void;
}) {
  const visible = usePageVisible();
  const active = useActiveScreen();
  const q = useQuery(reservationContactQuery(id, access, visible));
  const denied = isAccessError(q.error);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (denied) onAccessLost(true);
  }, [denied, onAccessLost]);
  if (denied) return null;
  if (q.isError)
    return (
      <ErrorState retry={() => void q.refetch()}>
        연락처를 확인하지 못했어요.
      </ErrorState>
    );
  if (!q.data) return <LoadingState>연락처 확인 중…</LoadingState>;
  const contact = q.data;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 py-4">
        <p className="min-w-0 text-sm font-semibold text-secondary wrap-anywhere">
          {contact.name}
        </p>
        {contact.phone ? (
          <>
            <a
              className="inline-flex min-h-11 items-center text-xl font-medium text-copy"
              href={`tel:${contact.phone}`}
            >
              {phoneLabel(contact.phone)}
            </a>
            <IconButton
              aria-label="연락처 복사"
              className="relative w-[26px] before:absolute before:-inset-x-[9px] before:inset-y-0"
              onClick={() => {
                void navigator.clipboard
                  .writeText(contact.phone!)
                  .then(() => {
                    if (active.current) setMessage("연락처를 복사했어요.");
                  })
                  .catch(() => {
                    if (active.current)
                      setMessage(
                        "복사하지 못했어요. 번호를 직접 선택해 주세요.",
                      );
                  });
              }}
            >
              <Image
                src="/images/reservations/contact-copy.svg"
                width={26}
                height={26}
                alt=""
              />
            </IconButton>
          </>
        ) : (
          <p className="text-sm text-muted">확인된 연락처가 없어요.</p>
        )}
      </div>
      {contact.changedAt && (
        <p className="text-xs text-muted">
          인수인계 후 현재 담당자의 연락처예요. 이전 문의의 담당자 기록은 그대로
          남아요.
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-secondary">
          {message}
        </p>
      )}
    </div>
  );
}

function phoneLabel(phone: string) {
  if (phone.startsWith("02"))
    return phone.replace(/^(02)(\d{3,4})(\d{4})$/, "$1-$2-$3");
  if (phone.length === 8) return phone.replace(/^(\d{4})(\d{4})$/, "$1-$2");
  if (phone.length === 12)
    return phone.replace(/^(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3");
  return phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
}
