export const kstDate = (at = new Date()) =>
  new Date(at.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
  };
}
export function moveMonth(month: string, offset: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function monthDays(month: string) {
  const { from, to } = monthRange(month),
    start = new Date(from),
    end = new Date(to);
  const padding = (start.getUTCDay() + 6) % 7;
  return Array.from(
    {
      length:
        Math.ceil(
          (padding + (end.getTime() - start.getTime()) / 86400000) / 7,
        ) * 7,
    },
    (_, i) =>
      new Date(start.getTime() + (i - padding) * 86400000)
        .toISOString()
        .slice(0, 10),
  );
}
