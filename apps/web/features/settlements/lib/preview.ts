export function preview(
  total: number,
  deposit: number,
  includeDeposit: boolean,
  support: number,
  count: number,
  remainder: boolean,
) {
  const values = [total, deposit, support];
  if (
    values.some(
      (v) => !Number.isSafeInteger(v) || v < 0 || v > 2_000_000_000,
    ) ||
    !total ||
    deposit > total
  )
    return {
      error: "금액은 1원 이상 정수이며 예약금은 전체 금액 이하여야 합니다.",
    };
  const target = total - (includeDeposit ? 0 : deposit) - support;
  if (target < 0)
    return {
      error: "예약금 제외액과 회비·지원금의 합이 전체 금액을 넘습니다.",
    };
  const rest = count ? target % count : 0;
  return {
    target,
    each: count ? Math.floor(target / count) : 0,
    rest,
    draft: target > 0 && (!count || (!!rest && !remainder)),
  };
}
