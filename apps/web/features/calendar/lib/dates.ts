export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
  };
}
