import Image from "next/image";
import Link from "next/link";
import { CompletionSteps } from "@/features/reservation-completion/client";
import type { ReservationRequest } from "../types/inquiry.types";
import { seatingLabels, spaceLabels } from "./proposal-card";

export function RebookingCard({
  inquiry,
  onHistory,
}: {
  inquiry: ReservationRequest;
  onHistory: () => void;
}) {
  const c = inquiry.snapshot;
  const schedule = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(c.startsAt));
  const rows = [
    ["이름", c.groupName ?? c.eventName],
    ["날짜·시간", schedule],
    ["인원", `${c.expectedGuests}명`],
    [
      "예산",
      c.budgetAmount == null
        ? "미정"
        : `${c.budgetBasis === "PER_PERSON" ? "1인" : "전체"} ${c.budgetAmount.toLocaleString("ko-KR")}원`,
    ],
    [
      "공간",
      [
        c.seating !== "ANY" ? seatingLabels[c.seating] : "",
        c.space !== "ANY" ? spaceLabels[c.space] : "",
      ]
        .filter(Boolean)
        .join(" · ") || "상관없음",
    ],
  ];
  return (
    <div className="pb-7">
      <CompletionSteps current={1} />
      <section className="mt-7 space-y-8 rounded-control bg-surface px-5 pt-10 pb-7 shadow-card">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="grid size-[85px] place-items-center rounded-full bg-[radial-gradient(ellipse_at_96%_78%,#ffdd99_0%,#fcbe7b_21%,#f99f5e_42%,#f78141_63%,#f46224_84%)]">
            <Image
              src="/images/reservations/rebooking-store.svg"
              alt=""
              width={47.8605}
              height={44.5}
            />
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl leading-[1.2] font-bold break-keep">
              예약할 매장을 선택해주세요
            </h2>
            <p className="text-xs leading-[1.2] break-keep">
              매장별 예약 조건을 비교하고, 원하는 매장을 선택해 주세요.
            </p>
            <Link
              href={`/restaurants?event=${inquiry.eventId}&inquiry=1&reinquire=${inquiry.id}&view=list`}
              className="inline-flex min-h-11 items-center gap-5 rounded-control bg-brand px-3.5 py-4 text-xs leading-[normal] text-white"
            >
              매장 선택하기
              <Image
                src="/images/reservations/attendance-next.svg"
                width={13.7105}
                height={10.937}
                alt=""
                className="rotate-180"
              />
            </Link>
          </div>
        </div>
        <div className="space-y-4 rounded-panel border border-placeholder p-5">
          <h3 className="text-sm leading-[normal] font-semibold">요청 조건</h3>
          <dl className="space-y-3">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[min(72px,32%)_minmax(0,1fr)] gap-3"
              >
                <dt className="text-xs leading-[normal] text-muted">{label}</dt>
                <dd className="text-sm leading-[normal] font-semibold wrap-anywhere">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <button
        type="button"
        onClick={onHistory}
        className="ml-auto block min-h-11 px-5 text-sm text-secondary underline underline-offset-2"
      >
        이전 예약·환불 내역 보기
      </button>
    </div>
  );
}
