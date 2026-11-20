import type { Completion } from "../types/completion.types";
import {
  agreementDate,
  spaceLabels,
  seatingLabels,
  usageLabel,
  won,
} from "../lib/agreement-labels";

export function AgreementTerms({
  data: q,
  compact = false,
  onOpen,
}: {
  data: Completion;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const a = q.agreement;
  const rows: [string, string][] = [
    ["매장", q.restaurantName],
    ["주소", q.restaurantAddress || "미확인"],
    ["날짜·시간", agreementDate(a.startsAt)],
    ["인원", `${a.expectedGuests}명`],
    ["공간", spaceLabels[a.space] ?? "미확인"],
    ["착석", seatingLabels[a.seating] ?? "미확인"],
    ["이용 시간", usageLabel(a)],
    ["최소 주문", won(a.minimumSpend)],
    [
      "최소 수량",
      a.minimumQuantity == null ? "미확인" : `${a.minimumQuantity}개`,
    ],
    ["별도 이용료", won(a.separateFee)],
    ["메뉴 기한", agreementDate(a.menuDeadlineAt)],
    [
      "제안 기준 예약금",
      a.deposit?.kind === "NONE"
        ? "없음"
        : a.deposit?.kind === "PER_RESERVATION"
          ? "예약별 협의"
          : won(a.deposit?.amount),
    ],
    ["변경·취소", a.changeCancellationPolicy || "미확인"],
    ["추가 안내", a.note || "없음"],
  ];
  const visibleRows = compact
    ? rows.filter(([label]) =>
        ["날짜·시간", "인원", "공간", "최소 주문"].includes(label),
      )
    : rows;
  return (
    <section
      id={`reservation-terms-${q.id}`}
      aria-label="현재 합의조건"
      className="scroll-mt-6 space-y-3 rounded-[16px] bg-surface p-4 shadow-card"
    >
      <div>
        <h3 className="text-sm font-semibold text-secondary">
          {onOpen ? (
            <button
              type="button"
              aria-label="현재 예약 조건 전체 보기"
              onClick={onOpen}
            >
              예약 조건
            </button>
          ) : (
            "예약 조건"
          )}
        </h3>
        {!compact && (
          <p className="sr-only">
            현재 {q.agreementRevision}차 합의 내용이에요.
          </p>
        )}
      </div>
      <dl className="space-y-3 text-sm">
        {visibleRows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3"
          >
            <dt className="text-secondary">{label}</dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
