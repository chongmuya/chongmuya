import { koreanDateLabel } from "@/shared/lib/korean-date";
import { cn } from "@/shared/lib/cn";
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
export function ChangedConditions({
  data: q,
  proposal: p,
}: {
  data: Completion;
  proposal: Pick<
    NonNullable<Change["proposal"]>,
    "agreement" | "order" | "guidance"
  >;
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
    ["날짜·시간", date(a.startsAt), date(b.startsAt)],
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
      a.deposit?.kind === "NONE" ? "없음" : won(a.deposit?.amount),
      b.deposit?.kind === "NONE" ? "없음" : won(b.deposit?.amount),
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
  ];
  const changed = rows.filter(([, before, after]) => before !== after);
  if (!changed.length) return null;
  return (
    <div className="space-y-5 rounded-[12px] border border-placeholder px-5 py-6">
      <h4 className="text-xl leading-[normal] font-semibold">바꾼 조건</h4>
      <dl className="space-y-4 leading-[normal] font-medium">
        {changed.map(([label, before, after]) => (
          <div
            key={label}
            className="grid grid-cols-[72px_minmax(0,1fr)] gap-3"
          >
            <dt className="text-muted">{label}</dt>
            <dd
              className={cn(
                "space-y-2 whitespace-pre-wrap",
                label === "날짜·시간" ? "break-keep" : "wrap-anywhere",
              )}
            >
              <del className="block">{before}</del>
              <span className="block text-brand">→ {after}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ProposalComparison({
  data: q,
  proposal: p,
  kind,
  onDetails,
  title,
  organizer = true,
}: {
  data: Completion;
  kind: Change["kind"];
  proposal: NonNullable<Change["proposal"]>;
  onDetails?: () => void;
  title?: string;
  organizer?: boolean;
}) {
  const actor = organizer ? "" : "총무가 ";
  return (
    <div className="space-y-7 text-base">
      <header className="space-y-2 text-center">
        {title && (
          <h3 className="text-2xl leading-[1.5] font-bold text-brand-ink">
            {title}
          </h3>
        )}
        <div className="leading-[1.5] break-keep wrap-anywhere">
          <p className="whitespace-pre-wrap">{p.reason}</p>
          <p>
            {kind === "CANCEL"
              ? `${actor}수락하면 예약이 취소돼요.`
              : `${actor}수락하면 바꾼 조건대로 예약이 수정돼요.`}
          </p>
        </div>
      </header>
      {kind === "CHANGE" && p.refundExpected !== null && (
        <p role="alert">
          변경 제안에는 환불 예정액을 적용할 수 없어요. 매장에 처리 내용을 다시
          제안해 달라고 요청해 주세요.
        </p>
      )}
      <div className="space-y-4">
        {kind === "CHANGE" && <ChangedConditions data={q} proposal={p} />}
        {onDetails && (
          <button
            type="button"
            className="relative ml-auto block text-sm leading-[normal] font-semibold text-brand before:absolute before:inset-x-0 before:-inset-y-3.5"
            onClick={onDetails}
          >
            전체 예약문의 보기
          </button>
        )}
      </div>
    </div>
  );
}
