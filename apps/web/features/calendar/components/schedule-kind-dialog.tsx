"use client";

import { useState, type RefObject } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";

const options = [
  {
    kind: "event",
    title: "행사 일정",
    description: "장소를 예약하고, 정산까지 하는 행사 일정이에요.",
  },
  {
    kind: "other",
    title: "기타 일정",
    description: "개인 메모나 별도 일정을 간단히 기록해요.",
  },
] as const;

type ScheduleKind = (typeof options)[number]["kind"];

export function ScheduleKindDialog({
  returnFocusRef,
  onClose,
  onSelect,
}: {
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSelect: (kind: ScheduleKind) => void;
}) {
  const [selected, setSelected] = useState<ScheduleKind>("event");

  return (
    <Dialog
      labelledBy="calendar-add-title"
      describedBy="calendar-add-description"
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      className="max-h-[calc(100svh-32px)] w-[calc(100%-32px)] max-w-[362px] p-[20px]"
    >
      <div className="space-y-7">
        <div className="space-y-2 text-center">
          <h2
            id="calendar-add-title"
            className="text-2xl leading-normal font-bold"
          >
            어떤 일정을 추가할까요?
          </h2>
          <p id="calendar-add-description" className="text-base text-copy">
            추가하려는 일정에 맞게 선택해 주세요.
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="sr-only">일정 종류</legend>
          {options.map(({ kind, title, description }) => {
            const checked = selected === kind;
            return (
              <label
                key={kind}
                className={cn(
                  "relative flex min-h-[79px] cursor-pointer items-center gap-[13px] rounded-control border border-transparent bg-soft px-2.5 py-4 has-checked:border-brand has-checked:bg-choice has-focus-visible:focus-outline",
                  kind === "other" && "min-h-[86px]",
                )}
              >
                <input
                  className="choice-card-radio"
                  type="radio"
                  name="calendar-schedule-kind"
                  value={kind}
                  checked={checked}
                  onChange={() => setSelected(kind)}
                  aria-labelledby={`calendar-kind-${kind}-title`}
                  aria-describedby={`calendar-kind-${kind}-description`}
                />
                {kind === "event" ? (
                  <Image
                    src={
                      checked
                        ? "/images/calendar/schedule-event-selected.svg"
                        : "/images/calendar/event.svg"
                    }
                    alt=""
                    width={30}
                    height={32}
                    className="shrink-0"
                  />
                ) : checked ? (
                  // Figma uses the same three-dot vector with the brand fill.
                  <span
                    aria-hidden="true"
                    className="size-[30px] shrink-0 bg-brand [mask:url(/images/calendar/schedule-other.svg)_center/contain_no-repeat]"
                  />
                ) : (
                  <Image
                    src="/images/calendar/schedule-other.svg"
                    alt=""
                    width={30}
                    height={30}
                    className="shrink-0"
                  />
                )}
                <span className="min-w-0 space-y-2 break-words">
                  <span
                    id={`calendar-kind-${kind}-title`}
                    className="block text-label text-copy"
                  >
                    {title}
                  </span>
                  <span
                    id={`calendar-kind-${kind}-description`}
                    className="block text-xs text-muted"
                  >
                    {description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="grid">
          <Button onClick={() => onSelect(selected)}>선택하기</Button>
          <Button
            variant="outline"
            className="border-transparent text-muted"
            onClick={onClose}
          >
            닫기
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
