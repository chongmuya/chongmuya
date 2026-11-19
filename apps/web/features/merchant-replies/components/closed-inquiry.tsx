import Image from "next/image";
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
      <p className="mt-5 text-base">
        {state === "SELECTED"
          ? "메뉴와 예약금을 준비하는 단계예요. 아직 예약 확정은 아니에요."
          : state === "EXPIRED"
            ? "총무의 선택 기한이 지났어요."
            : state === "OTHER_SELECTED"
              ? "총무가 다른 매장을 선택했어요."
              : "이 문의에는 답변을 추가하거나 수정할 수 없어요."}
      </p>
      <p className="mt-5 text-sm text-muted">
        기존 답변은 이력으로 보존됩니다.
      </p>
    </section>
  );
}
