import Image from "next/image";

const closureReasons = new Map([
  ["SELECTED", "메뉴와 예약금을 준비하는 단계예요. 아직 예약 확정은 아니에요."],
  ["OTHER_SELECTED", "총무가 다른 매장을 선택했어요."],
  ["ORGANIZER_DECLINED", "총무가 이 매장의 제안을 거절했어요."],
  ["MERCHANT_DECLINED", "매장이 예약이 어렵다고 답변했어요."],
  ["EXPIRED", "총무의 선택 기한이 지났어요."],
  ["OPERATOR_CLOSED", "운영자가 문의를 종료했어요."],
]);
export function inquiryClosureMessage(state: string) {
  return (
    closureReasons.get(state) ??
    "이 문의에는 답변을 추가하거나 수정할 수 없어요."
  );
}

export function ClosedInquiry({ state }: { state: string }) {
  return (
    <section className="my-12 text-center">
      <Image
        src="/images/reservations/closed.svg"
        alt=""
        width={72}
        height={72}
        className="mx-auto mb-5"
      />
      <h1 className="text-xl font-bold">
        {state === "SELECTED"
          ? "총무가 매장을 선택했어요"
          : "이 예약 문의는 종료됐어요"}
      </h1>
      <p className="mt-5 text-base">{inquiryClosureMessage(state)}</p>
      <p className="mt-5 text-sm text-muted">
        기존 답변은 이력으로 보존됩니다.
      </p>
    </section>
  );
}
