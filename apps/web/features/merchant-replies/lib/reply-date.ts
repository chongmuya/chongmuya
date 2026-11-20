const replyDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

export function replyDateLabel(value: string, separator = ".") {
  const parts = replyDate.formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${get("month")}${separator}${get("day")} (${get("weekday")})`;
}
