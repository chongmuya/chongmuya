"use client";

import Image from "next/image";
import { useRef } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { confirmationDeadline } from "../lib/confirmation-deadline";
import type { Detail } from "../types/settlement.types";

export function DeadlineReminder({
  data,
  open,
  onClose,
  onViewPeople,
  onCreateNotice,
}: {
  data: Detail;
  open: boolean;
  onClose: () => void;
  onViewPeople: () => void;
  onCreateNotice: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const due = confirmationDeadline(data);
  if (!due || !open) return null;
  const requiresReview = due.calculationChanged || due.ownerChanged;
  const reviewSubject = due.calculationChanged
    ? due.ownerChanged
      ? "계산 기준과 총무가"
      : "계산 기준이"
    : "총무가";
  const blocked = data.summary.drafts > 0 || !!data.depositConflicts?.length;
  const viewPeople = () => {
    onClose();
    onViewPeople();
  };
  return (
    <Dialog
      labelledBy="settlement-deadline-title"
      describedBy="settlement-deadline-description"
      initialFocusRef={heading}
      onClose={onClose}
      className="max-w-[362px] space-y-7"
    >
      <div className="relative h-[13.855px]">
        <IconButton
          aria-label="닫기"
          className="absolute -top-[15px] -left-[15px]"
          onClick={onClose}
        >
          <Image
            src="/images/ui/close.svg"
            alt=""
            width={14.7749}
            height={14.9156}
          />
        </IconButton>
      </div>
      <header className="space-y-2 text-center">
        <h2
          id="settlement-deadline-title"
          ref={heading}
          tabIndex={-1}
          className="break-keep text-xl font-semibold leading-[normal] text-brand-ink focus:outline-none"
        >
          입금 내역을 확인해 주세요
        </h2>
        <p
          id="settlement-deadline-description"
          className="text-xs leading-[normal] text-black/80"
        >
          기한 {due.deadline} 경과 · {due.people.length}명,{" "}
          {due.amount.toLocaleString()}원 미확인
          <br />
          {requiresReview
            ? `${reviewSubject} 바뀌어 현재 내역을 다시 확인해 주세요.`
            : "입금 여부를 확인하고, 정산문을 다시 쓸 수 있어요."}
          {blocked && (
            <>
              <br />
              미완성 지출·예약금을 확인한 뒤 정산문을 써 주세요.
            </>
          )}
        </p>
      </header>
      <div>
        <div className="flex min-h-[25px] justify-between gap-3 px-5 py-1 text-sm font-semibold leading-[normal] text-placeholder">
          <span className="w-[37px] text-center">이름</span>
          <div className="flex items-center gap-[11px]">
            <span>미확인 잔액</span>
            <span className="w-7 text-center">입금</span>
          </div>
        </div>
        <ul aria-label="입금 미확인 대상">
          {due.people.map((person) => (
            <li
              key={person.person.id}
              className="flex min-h-[67px] items-center justify-between gap-4 px-5 py-4 leading-[normal]"
            >
              <div className="min-w-0">
                <p className="break-words text-center text-sm font-semibold leading-[normal] text-black">
                  {person.person.name}
                </p>
                {(person.person.label || person.person.phoneLast4) && (
                  <p className="mt-1 break-words text-center text-xs leading-[normal] text-black/80">
                    {person.person.label} {person.person.phoneLast4}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-[11px]">
                <p className="text-base font-medium leading-[normal] text-black">
                  {person.remaining.toLocaleString()}원
                </p>
                <span
                  role="img"
                  aria-label="입금 미확인"
                  className="size-7 rounded-full border border-placeholder"
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <Button
          className="w-full border-brand bg-brand text-soft"
          disabled={blocked}
          onClick={() => {
            onClose();
            onCreateNotice();
          }}
        >
          정산문 쓰러가기
        </Button>
        <Button
          variant="brand-outline"
          className="w-full border-2 text-brand"
          onClick={viewPeople}
        >
          개인별 정산 보기
        </Button>
      </div>
    </Dialog>
  );
}
