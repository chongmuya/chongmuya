export const REMINDER_TIME_ZONE = "Asia/Seoul";
export const REMINDER_HOUR = 9;
export function koreanDate(at: Date) {
  return new Date(at.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function reminderAt(date: string) {
  return new Date(
    Date.parse(`${date}T00:00:00.000Z`) -
      86400000 +
      (REMINDER_HOUR - 9) * 3600000,
  );
}
// A batch belongs to the Korean day on which 09:00 occurs, never the event day.
export function reminderBatch(at: Date) {
  const date = koreanDate(at);
  const targetDate = new Date(Date.parse(date) + 86400000)
    .toISOString()
    .slice(0, 10);
  const from = new Date(`${targetDate}T00:00:00+09:00`);
  return {
    date,
    targetDate,
    due: reminderAt(targetDate),
    from,
    to: new Date(from.getTime() + 86400000),
  };
}
export function calendarRange(from: string, to: string) {
  if (!validDate(from) || !validDate(to)) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  return days > 0 && days <= 62
    ? {
        from: new Date(`${from}T00:00:00+09:00`),
        to: new Date(`${to}T00:00:00+09:00`),
      }
    : null;
}
