import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import type { RegistrationData } from "../schemas/registration.schema";
import { OwnerCheck } from "./owner-fields";

type Rows = [label: string, value: string][];

const money = (n: number | null) =>
  n === null ? "미확인" : n === 0 ? "없음" : `${n.toLocaleString("ko-KR")}원`;
const count = (n: number | null) =>
  n === null ? "미확인" : n === 0 ? "제한 없음" : `${n}명`;
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function hoursLabel(policies: RegistrationData["policies"]) {
  const hours = policies.hours;
  return hours && hours.start && hours.end
    ? `${hours.start} - ${hours.endDayOffset ? "익일 " : ""}${hours.end}`
    : "미확인";
}

function holidayLabel(policies: RegistrationData["policies"]) {
  const holidays = policies.holidays;
  if (holidays.kind === "WEEKLY")
    return (
      holidays.weekdays.map((value) => `${weekdays[value]}요일`).join(" · ") ||
      "미확인"
    );
  if (holidays.kind === "IRREGULAR") return holidays.note || "비정기 휴무";
  return holidays.kind === "NONE" ? "정기 휴무 없음" : "미확인";
}

function advanceLabel({ advance }: RegistrationData["policies"]) {
  if (advance.kind === "SAME_DAY") return "당일에도 가능";
  if (advance.kind === "NO_FIXED_RULE") return "정해진 기준 없음";
  return advance.kind === "DAYS_BEFORE" && advance.days !== null
    ? `방문 ${advance.days}일 전 문의`
    : "미확인";
}

const depositLabel = ({ deposit }: RegistrationData["policies"]) =>
  deposit.kind === "PER_RESERVATION"
    ? "있음 (예약에 따라 결정)"
    : money(deposit.amount);

const deadlineLabel = (
  deadline: RegistrationData["policies"]["menuDeadline"],
) => {
  if (deadline.kind === "ANYTIME") return "언제든지 가능";
  if (deadline.kind === "UNKNOWN" || deadline.value === null) return "미확인";
  return `방문 ${deadline.value}${deadline.kind === "DAYS_BEFORE" ? "일" : "시간"} 전까지`;
};

function roomLabel(spaces: RegistrationData["spaces"]) {
  const rooms = spaces.filter(
    (space) => space.kind === "ROOM" && space.availability !== "UNAVAILABLE",
  );
  return rooms.length ? `가능 (${rooms.length}개)` : "등록된 룸 없음";
}

function SummaryRows({ rows, className }: { rows: Rows; className?: string }) {
  return (
    <dl className={cn("space-y-3 text-control", className)}>
      {rows.map(([label, value], i) => (
        <div
          key={`${label}:${i}`}
          className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3"
        >
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OwnerSummary({
  data: d,
  onEdit,
  onConsentChange,
  contactSettings,
}: {
  data: RegistrationData;
  onEdit?: (step: number) => void;
  onConsentChange?: (checked: boolean) => void;
  contactSettings?: ReactNode;
}) {
  const p = d.policies;
  const sections: { title: string; rows: Rows }[] = [
    {
      title: d.name || "기본 정보",
      rows: [
        ["지점명", d.branchName || "미입력"],
        ["주소", `${d.addressQuery} ${d.detailAddress}`.trim() || "미입력"],
        ["음식 종류", d.category],
        [
          "예약 문의",
          d.phone?.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") || "미입력",
        ],
      ],
    },
    {
      title: "수용 인원 및 공간",
      rows: [
        ["매장 수용 인원", count(d.maxCapacity)],
        [
          "공간 이용 안내",
          d.spaces
            .filter(
              (space) =>
                space.kind !== "ROOM" && space.availability !== "UNAVAILABLE",
            )
            .map((space) => space.label)
            .join(" · ") || "미확인",
        ],
        ["룸 대관", roomLabel(d.spaces)],
        ...d.spaces.flatMap((space): Rows => {
          const conditions = [
            space.availability === "UNAVAILABLE" && "이용 중단",
            space.capacity !== null && `최대 ${count(space.capacity)}`,
            space.minGuests !== null && `최소 ${count(space.minGuests)}`,
            space.minSpend !== null && `최소 이용 ${money(space.minSpend)}`,
            space.separateFee !== null &&
              `별도 비용 ${money(space.separateFee)}`,
            space.togetherSeating !== "UNKNOWN" &&
              (space.togetherSeating === "YES" ? "함께 착석" : "분리 착석"),
            space.conditions,
          ]
            .filter(Boolean)
            .join(" · ");
          return conditions ? [[space.label || "공간", conditions]] : [];
        }),
      ],
    },
    {
      title: "예약 조건",
      rows: [
        ["대표 영업시간", hoursLabel(p)],
        ["휴무일", holidayLabel(p)],
        ["예약 가능 시점", advanceLabel(p)],
        [
          "최소 주문 조건",
          p.minimumOrder.kind === "NONE"
            ? "없음"
            : p.minimumOrder.kind === "AMOUNT"
              ? money(p.minimumOrder.amount)
              : p.minimumOrder.kind === "QUANTITY"
                ? `${p.minimumOrder.quantity ?? "미입력"} ${p.minimumOrder.unit}`
                : "미확인",
        ],
      ],
    },
    {
      title: "변경 및 취소 정책",
      rows: [
        ["메뉴 변경", deadlineLabel(p.menuDeadline)],
        ["인원 변경", deadlineLabel(p.guestDeadline)],
        [
          "이용 시간 제한",
          p.usage.kind === "NONE"
            ? "없음"
            : p.usage.kind === "LIMITED" && p.usage.minutes !== null
              ? `${p.usage.minutes}분`
              : "미확인",
        ],
        ["예약금", depositLabel(p)],
      ],
    },
  ];
  if (!contactSettings && d.publicPhone)
    sections[0]!.rows.push(["고객용 대표번호", d.publicPhone]);
  if (!onConsentChange)
    sections[0]!.rows.push([
      "문자 수신 동의",
      d.receiveConsent ? "동의" : "동의하지 않음",
    ]);
  return (
    <div className="space-y-7">
      {sections.map(({ title, rows }, i) => (
        <section key={title + i} className="space-y-3">
          {i !== 0 && <h2 className="text-label">{title}</h2>}
          <div className="space-y-4 rounded-card bg-surface px-[clamp(16px,6vw,27px)] py-6 shadow-card">
            {(i === 0 || onEdit) && (
              <div className="flex min-w-0 items-center justify-between gap-2">
                {i === 0 && (
                  <h2 className="min-w-0 text-label break-words">{title}</h2>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(i)}
                    aria-label={`${i === 0 ? "기본 정보" : title} 수정하기`}
                    className="ml-auto flex min-h-7 shrink-0 cursor-pointer items-center gap-0.5 rounded-sm text-xs text-muted"
                  >
                    <Image
                      src="/images/owner-registration/edit.svg"
                      width={15}
                      height={15}
                      style={{ width: "auto", height: 15 }}
                      alt=""
                    />
                    수정하기
                  </button>
                )}
              </div>
            )}
            <SummaryRows rows={rows} />
            {i === 0 && onConsentChange && (
              <div className="border-t border-field pt-3">
                <OwnerCheck
                  name="receiveConsent"
                  tick
                  checked={d.receiveConsent}
                  onChange={(event) => onConsentChange(event.target.checked)}
                >
                  <span className="text-sm">
                    이 번호로 단체 예약 문의 문자 받기 (선택)
                  </span>
                </OwnerCheck>
                {contactSettings}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function OwnerCompletionSummary({ data }: { data: RegistrationData }) {
  const p = data.policies;
  return (
    <section className="space-y-3 px-[17px]">
      <h2 className="text-label text-copy/80">등록 요약</h2>
      <div className="relative rounded-card bg-surface px-[clamp(16px,6vw,27px)] py-6 shadow-card">
        <h3 className="pr-[74px] text-label break-words">
          {data.name}
          {data.branchName && `(${data.branchName})`}
        </h3>
        <SummaryRows
          className="mt-5"
          rows={[
            [
              "수용 인원",
              data.maxCapacity === null
                ? "미확인"
                : `최대 ${count(data.maxCapacity)}`,
            ],
            ["룸 대관", roomLabel(data.spaces)],
            ["영업 시간", hoursLabel(p)],
            ["휴무일", holidayLabel(p)],
            ["단체 예약", advanceLabel(p)],
            ["예약금", depositLabel(p)],
          ]}
        />
        <details className="group open:mt-4">
          <summary className="absolute top-6 right-6 flex min-h-6 cursor-pointer items-center gap-1 rounded-sm text-xs text-muted [&::-webkit-details-marker]:hidden">
            자세히 보기
            <Image
              src="/images/owner-registration/detail-arrow.svg"
              width={8}
              height={14}
              style={{ width: "auto", height: 13.5 }}
              alt=""
              className="rotate-180 group-open:-rotate-90"
            />
          </summary>
          <div className="pt-2">
            <OwnerSummary data={data} />
          </div>
        </details>
      </div>
    </section>
  );
}
