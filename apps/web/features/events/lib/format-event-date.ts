export function dateLabel(value: string | null) {
  return value
    ? `${new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value))} (한국 시간)`
    : "일정 미정";
}
