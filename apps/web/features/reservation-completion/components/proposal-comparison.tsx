import { koreanDateLabel } from "@/shared/lib/korean-date";
import type {
  Completion,
  Change,
  Agreement,
  Order,
  Guidance,
} from "../types/completion.types";
import { won } from "./completion-summary";
const date = (v: string | null) => (v ? koreanDateLabel(v) : "미확인");
const quantity = (v: number | null | undefined) =>
  v == null ? "미확인" : `${v}개`;
const usage = (a: Agreement) =>
  a.usageTime?.kind === "UNLIMITED"
    ? "제한 없음"
    : a.usageTime?.kind === "MINUTES"
      ? `${a.usageTime.minutes}분`
      : "미확인";
const menu = (o: Order | null) =>
  o
    ? `${o.lines.map((l) => `${l.name} (${l.unit}) ${won(l.price)} × ${l.quantity} = ${won(l.subtotal)}`).join(" / ")} · 합계 ${won(o.total)}`
    : "미제출";
const deposit = (g: Guidance) =>
  g.kind === "NONE"
    ? "예약금 없음"
    : g.kind === "UNKNOWN"
      ? "미확인"
      : won(g.amount);
const channel = (g: Guidance) =>
  g.channel === "SMS"
    ? "문자로만 안내"
    : g.channel === "WEB"
      ? `${g.bank} ${g.account} ${g.holder}`
      : "안내 준비 중";
export function ProposalComparison({
  data: q,
  proposal: p,
}: {
  data: Completion;
  proposal: NonNullable<Change["proposal"]>;
}) {
  const a = q.agreement,
    b = p.agreement;
  const space = {
      ANY: "상관없음",
      HALL: "일반 홀",
      ROOM: "룸",
      FLOOR: "한 층",
      WHOLE: "전체 대관",
    },
    seating = { ANY: "상관없음", CLOSE: "가까이", SEPARATED: "떨어져도 가능" };
  const rows: [string, string, string][] = [
    ["일정", date(a.startsAt), date(b.startsAt)],
    ["인원", `${a.expectedGuests}명`, `${b.expectedGuests}명`],
    ["공간", space[a.space], space[b.space]],
    ["착석", seating[a.seating], seating[b.seating]],
    ["최소 주문 금액", won(a.minimumSpend), won(b.minimumSpend)],
    [
      "최소 주문 수량",
      quantity(a.minimumQuantity),
      quantity(b.minimumQuantity),
    ],
    ["별도 이용료", won(a.separateFee), won(b.separateFee)],
    ["메뉴 제출 기한", date(a.menuDeadlineAt), date(b.menuDeadlineAt)],
    ["이용 시간", usage(a), usage(b)],
    ["전달 메뉴", menu(q.order), menu(p.order)],
    [
      "제안 기준 예약금",
      a.deposit.kind === "NONE" ? "없음" : won(a.deposit.amount),
      b.deposit.kind === "NONE" ? "없음" : won(b.deposit.amount),
    ],
    ["예약금", deposit(q.guidance), deposit(p.guidance)],
    ["입금 기한", date(q.guidance.deadline), date(p.guidance.deadline)],
    ["계좌 제공 방식·안내", channel(q.guidance), channel(p.guidance)],
    ["예약금 안내의 변경·취소·환불 조건", q.guidance.policy, p.guidance.policy],
    [
      "제안의 변경·취소 조건",
      a.changeCancellationPolicy ?? "미확인",
      b.changeCancellationPolicy ?? "미확인",
    ],
    ["매장 추가 안내", a.note || "없음", b.note || "없음"],
    ["환불 예정 총액", won(q.refundExpected), won(p.refundExpected)],
  ];
  return (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap">처리 제안: {p.reason}</p>
      <p>
        수락하면 아래 제안 내용이 적용돼요. 기존 내용과 모든 조건을 비교해
        주세요.
      </p>
      <dl className="divide-y divide-border">
        {rows.map(([label, before, after]) => (
          <div key={label} className="space-y-1 py-3">
            <dt className="font-semibold">{label}</dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">
              <span className="text-muted">기존: </span>
              {before}
            </dd>
            <dd className="whitespace-pre-wrap wrap-anywhere">
              <span className="text-brand-action">제안: </span>
              {after}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
