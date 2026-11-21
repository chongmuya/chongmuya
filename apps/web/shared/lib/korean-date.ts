const timeZone = "Asia/Seoul";

export function koreanDateInput(instant: string | null | undefined) {
  if (instant && !/(?:Z|[+-]\d{2}:\d{2})$/.test(instant)) return instant;
  return instant
    ? new Date(Date.parse(instant) + 9 * 3600_000).toISOString().slice(0, 16)
    : "";
}

export function fromKoreanDateInput(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ||
    !isDateOnly(value.slice(0, 10))
  )
    return null;
  const time = Date.parse(value + "+09:00");
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export const koreanDateLabel = (instant: string) =>
  new Date(instant).toLocaleString("ko-KR", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const compactEventDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function compactEventDate(value: string | null) {
  if (!value) return "일정 미정";
  const parts = compactEventDateFormatter.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}.${part("day")} (${part("weekday")}) ${part("hour")}:${part("minute")}`;
}

export function isDateOnly(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export const koreanDateOnly = (date = new Date()) =>
  new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
