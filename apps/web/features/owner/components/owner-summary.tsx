import { Button } from "@/shared/ui/button";
import type { RegistrationData } from "../schemas/registration.schema";
const money = (n: number | null) =>
  n === null
    ? "확인 필요"
    : n === 0
      ? "없음"
      : `${n.toLocaleString("ko-KR")}원`;
const count = (n: number | null) =>
  n === null ? "확인 필요" : n === 0 ? "제한 없음" : `${n}명`;
export function OwnerSummary({
  data: d,
  onEdit,
}: {
  data: RegistrationData;
  onEdit?: (step: number) => void;
}) {
  const p = d.policies;
  const deadline = (v: typeof p.menuDeadline) =>
    v.kind === "UNKNOWN"
      ? "확인 필요"
      : v.kind === "ANYTIME"
        ? "언제든지 가능"
        : `${v.value ?? "미입력"}${v.kind === "DAYS_BEFORE" ? "일" : "시간"} 전`;
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: d.name || "기본 정보",
      rows: [
        ["지점명", d.branchName || "미입력"],
        ["주소", `${d.addressQuery} ${d.detailAddress}`.trim() || "미입력"],
        ["음식 종류", d.category],
        ["고객용 대표번호", d.publicPhone || "미확인"],
        ["예약 문의", d.phone || "미입력"],
        ["문자 수신 동의", d.receiveConsent ? "동의" : "동의하지 않음"],
      ],
    },
    {
      title: "수용 인원 및 공간",
      rows: [
        ["전체 수용 인원", count(d.maxCapacity)],
        ...d.spaces.map((s): [string, string] => [
          `${s.label || "이름 미입력"} · ${{ HALL: "홀", FLOOR: "층", WHOLE: "전체", ROOM: "룸" }[s.kind]}`,
          `${{ AVAILABLE: "운영 중", UNAVAILABLE: "이용 중단", UNKNOWN: "운영 여부 확인 필요" }[s.availability]} / 최대 ${count(s.capacity)} / 최소 ${count(s.minGuests)} / 최소 이용 ${money(s.minSpend)} / 별도 비용 ${money(s.separateFee)} / 착석 ${{ YES: "함께", NO: "분리", UNKNOWN: "확인 필요" }[s.togetherSeating]}${s.conditions ? ` / ${s.conditions}` : ""}`,
        ]),
      ],
    },
    {
      title: "예약 조건",
      rows: [
        [
          "대표 영업시간",
          p.hours
            ? `${p.hours.start || "미입력"}~${p.hours.endDayOffset ? "익일 " : ""}${p.hours.end || "미입력"}`
            : "확인 필요",
        ],
        [
          "휴무",
          p.holidays.kind === "WEEKLY"
            ? p.holidays.weekdays
                .map((i) => ["일", "월", "화", "수", "목", "금", "토"][i])
                .join(" · ") || "요일 미입력"
            : p.holidays.kind === "IRREGULAR"
              ? `비정기 ${p.holidays.note}`
              : p.holidays.kind === "NONE"
                ? "정기 휴무 없음"
                : "확인 필요",
        ],
        [
          "사전 문의",
          p.advance.kind === "SAME_DAY"
            ? "당일 가능"
            : p.advance.kind === "NO_FIXED_RULE"
              ? "정해진 기준 없음"
              : p.advance.kind === "DAYS_BEFORE"
                ? `${p.advance.days ?? "미입력"}일 전`
                : "확인 필요",
        ],
        [
          "최소 주문",
          p.minimumOrder.kind === "NONE"
            ? "없음"
            : p.minimumOrder.kind === "AMOUNT"
              ? money(p.minimumOrder.amount)
              : p.minimumOrder.kind === "QUANTITY"
                ? `${p.minimumOrder.quantity ?? "미입력"} ${p.minimumOrder.unit}`
                : "확인 필요",
        ],
      ],
    },
    {
      title: "메뉴 확정·인원 변경 조건",
      rows: [
        ["메뉴 확정 기한", deadline(p.menuDeadline)],
        ["인원 변경 기한", deadline(p.guestDeadline)],
        [
          "이용 시간",
          p.usage.kind === "NONE"
            ? "제한 없음"
            : p.usage.kind === "LIMITED"
              ? `${p.usage.minutes ?? "미입력"}분`
              : "확인 필요",
        ],
        [
          "예약금",
          p.deposit.kind === "PER_RESERVATION"
            ? "예약별 협의"
            : money(p.deposit.amount),
        ],
      ],
    },
  ];
  return (
    <div className="space-y-6">
      {sections.map((section, i) => (
        <section
          key={section.title}
          className="rounded-control bg-surface p-5 shadow-card"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-bold">{section.title}</h2>
            {onEdit && (
              <Button variant="outline" onClick={() => onEdit(i)}>
                수정
              </Button>
            )}
          </div>
          <dl className="space-y-3 text-sm">
            {section.rows.map(([label, value], index) => (
              <div
                key={`${label}:${index}`}
                className="grid grid-cols-[5.5rem_1fr] gap-3"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
