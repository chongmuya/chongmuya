"use client";
import { DayPicker, TZDate, type ChevronProps } from "@daypicker/react";
import Image from "next/image";
import { ko } from "@daypicker/react/locale";
import { cn } from "../lib/cn";
import { isDateOnly, koreanDateOnly } from "../lib/korean-date";
const zone = "Asia/Seoul";
const day = (value: string) => new TZDate(`${value}T00:00:00+09:00`, zone);
function CalendarChevron({ orientation = "left" }: ChevronProps) {
  return (
    <Image
      style={{ height: "auto" }}
      src={`/images/calendar/${orientation === "right" ? "next" : "previous"}.svg`}
      width={10.4142}
      height={18}
      alt=""
      className={orientation === "right" ? "rotate-180" : undefined}
    />
  );
}
export function Calendar({
  value,
  onChange,
  month,
  onMonthChange,
  markedDates = [],
  min,
  max,
  autoFocus = false,
  showYear = true,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  month?: string;
  onMonthChange?: (month: string) => void;
  markedDates?: string[];
  min?: string;
  max?: string;
  autoFocus?: boolean;
  showYear?: boolean;
  className?: string;
}) {
  const marked = new Set(markedDates);
  return (
    <DayPicker
      mode="single"
      required
      locale={ko}
      timeZone={zone}
      weekStartsOn={1}
      showOutsideDays
      autoFocus={autoFocus}
      components={{ Chevron: CalendarChevron }}
      formatters={{
        formatCaption: (date) =>
          new Intl.DateTimeFormat("ko-KR", {
            timeZone: zone,
            ...(showYear ? { year: "numeric" as const } : {}),
            month: "long",
          }).format(date),
      }}
      selected={isDateOnly(value) ? day(value) : undefined}
      month={month ? day(`${month}-01`) : undefined}
      defaultMonth={isDateOnly(value) ? day(value) : undefined}
      onMonthChange={
        onMonthChange
          ? (date) => onMonthChange(koreanDateOnly(date).slice(0, 7))
          : undefined
      }
      onSelect={(date) => {
        if (date) onChange(koreanDateOnly(date));
      }}
      disabled={[
        ...(min && isDateOnly(min) ? [{ before: day(min) }] : []),
        ...(max && isDateOnly(max) ? [{ after: day(max) }] : []),
      ]}
      modifiers={{ scheduled: (date) => marked.has(koreanDateOnly(date)) }}
      modifiersClassNames={{ scheduled: "calendar-scheduled" }}
      labels={{
        labelPrevious: () => "이전 달",
        labelNext: () => "다음 달",
        labelDayButton: (date, modifiers) =>
          `${new Intl.DateTimeFormat("ko-KR", { timeZone: zone, dateStyle: "full" }).format(date)}${modifiers.today ? ", 오늘" : ""}${modifiers.selected ? ", 선택됨" : ""}${marked.has(koreanDateOnly(date)) ? ", 일정 있음" : ""}`,
      }}
      className={cn("service-calendar mx-auto w-full max-w-[326px]", className)}
      classNames={{
        root: "relative",
        months: "relative",
        month: "w-full",
        month_caption:
          "flex h-11 items-center justify-center text-xl font-semibold leading-6",
        caption_label: "text-center",
        nav: "pointer-events-none absolute -inset-x-1 top-0 flex justify-between",
        button_previous:
          "pointer-events-auto flex size-11 items-center justify-center rounded-full text-secondary",
        button_next:
          "pointer-events-auto flex size-11 items-center justify-center rounded-full text-secondary",
        chevron: "size-5 fill-current",
        month_grid: "w-full table-fixed border-collapse",
        weekdays: "",
        weekday: "h-[34px] text-[13px] font-medium text-secondary",
        week: "",
        day: "relative h-12 p-0 text-center text-[15px] leading-5",
        day_button:
          "relative mx-auto flex h-12 w-full max-w-12 items-center justify-center rounded-full disabled:cursor-not-allowed",
        selected: "calendar-selected",
        today: "calendar-today",
        outside: "text-muted",
        disabled: "opacity-35",
        hidden: "invisible",
      }}
    />
  );
}
