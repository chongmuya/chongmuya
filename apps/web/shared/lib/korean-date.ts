const timeZone = "Asia/Seoul";

export function koreanDateInput(instant: string | null | undefined) {
  return instant
    ? new Date(Date.parse(instant) + 9 * 3600_000).toISOString().slice(0, 16)
    : "";
}

export function fromKoreanDateInput(value: string) {
  const time = Date.parse(value + "+09:00");
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export const koreanDateLabel = (instant: string) =>
  new Date(instant).toLocaleString("ko-KR", { timeZone });
