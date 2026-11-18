export const spaceCost = (label: string, amount: number | null) =>
  `${label} ${amount === null ? "확인 필요" : amount === 0 ? "없음" : `${amount.toLocaleString()}원`}`;
