import Image from "next/image";
import { useState } from "react";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { TimePicker } from "@/shared/ui/time-picker";
import { isDateOnly } from "@/shared/lib/korean-date";
import { replyDateLabel } from "../lib/reply-date";

export function ReplyDateTime({
  value,
  onChange,
  invalid,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  onBlur: () => void;
}) {
  const [date = "", time = ""] = value.split("T");
  const [draftTime, setDraftTime] = useState<string | null>(null);
  const set = (day: string, clock: string) => onChange(`${day}T${clock}`);
  return (
    <div className="grid grid-cols-2 gap-3.5">
      <div className="space-y-2 text-xs">
        <label htmlFor="reply-date" className="block leading-[normal]">
          날짜
        </label>
        <DatePicker
          id="reply-date"
          label="제안 날짜"
          value={date}
          formatValue={(day) =>
            isDateOnly(day) ? replyDateLabel(`${day}T00:00:00+09:00`) : day
          }
          onChange={(day) => set(day, time)}
          onBlur={onBlur}
          aria-invalid={invalid}
          aria-describedby="reply-starts-at-error"
          className="min-h-[49px] border-placeholder shadow-none"
        />
      </div>
      <div className="space-y-2 text-xs">
        <label htmlFor="reply-time" className="block leading-[normal]">
          시간
        </label>
        <Button
          id="reply-time"
          variant="outline"
          className="min-h-[49px] w-full justify-between border-placeholder px-3 text-left font-normal text-copy"
          aria-haspopup="dialog"
          aria-expanded={draftTime !== null}
          aria-invalid={invalid}
          aria-describedby="reply-starts-at-error"
          onClick={() => setDraftTime(time)}
        >
          {time || "시간 선택"}
          <Image
            src="/images/calendar/field-arrow.svg"
            alt=""
            width={8}
            height={13}
            className="-rotate-90"
          />
        </Button>
      </div>
      {draftTime !== null && (
        <BottomSheet title="제안 시간" onClose={() => setDraftTime(null)}>
          <TimePicker value={draftTime} onChange={setDraftTime} />
          <Button
            className="mt-4 w-full"
            disabled={!/^\d{2}:\d{2}$/.test(draftTime)}
            onClick={() => {
              set(date, draftTime);
              setDraftTime(null);
            }}
          >
            확인
          </Button>
        </BottomSheet>
      )}
    </div>
  );
}
