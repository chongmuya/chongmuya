"use client";
import { useFormContext, useWatch } from "react-hook-form";
import { OwnerCheck as Checkbox } from "./owner-fields";
import { OwnerChoice, OwnerField } from "./owner-fields";
import type { RegistrationData } from "../schemas/registration.schema";
export function OwnerPolicyFields({ step }: { step: 2 | 3 }) {
  const { control, setValue } = useFormContext<RegistrationData>();
  const p = useWatch({ control, name: "policies" });
  if (step === 2)
    return (
      <div className="space-y-8">
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">대표 영업시간</legend>
          <Checkbox
            checked={!!p.hours}
            onChange={(e) =>
              setValue(
                "policies.hours",
                e.target.checked
                  ? { start: "", end: "", endDayOffset: 0 }
                  : null,
              )
            }
          >
            영업시간 입력
          </Checkbox>
          {p.hours && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <OwnerField
                  path="policies.hours.start"
                  label="시작 (HH:MM)"
                  placeholder="예: 17:00"
                />
                <OwnerField
                  path="policies.hours.end"
                  label="종료 (HH:MM)"
                  placeholder="예: 24:00"
                />
              </div>
              <Checkbox
                checked={p.hours.endDayOffset === 1}
                onChange={(e) =>
                  setValue(
                    "policies.hours.endDayOffset",
                    e.target.checked ? 1 : 0,
                  )
                }
              >
                다음 날 종료 (예: 익일 02:00)
              </Checkbox>
            </>
          )}
        </fieldset>
        <OwnerChoice
          path="policies.holidays.kind"
          label="정기 휴무일"
          options={[
            ["UNKNOWN", "미확인"],
            ["NONE", "정기 휴무 없음"],
            ["WEEKLY", "요일별 정기 휴무"],
            ["IRREGULAR", "비정기 휴무"],
          ]}
          changed={() => {
            setValue("policies.holidays.weekdays", []);
            setValue("policies.holidays.note", "");
          }}
        />
        {p.holidays.kind === "WEEKLY" && (
          <fieldset className="flex flex-wrap gap-3">
            <legend className="sr-only">휴무 요일</legend>
            {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
              <Checkbox
                key={day}
                checked={p.holidays.weekdays.includes(i)}
                onChange={(e) =>
                  setValue(
                    "policies.holidays.weekdays",
                    e.target.checked
                      ? [...p.holidays.weekdays, i]
                      : p.holidays.weekdays.filter((v) => v !== i),
                  )
                }
              >
                {day}
              </Checkbox>
            ))}
          </fieldset>
        )}
        {p.holidays.kind === "IRREGULAR" && (
          <OwnerField path="policies.holidays.note" label="비정기 휴무 안내" />
        )}
        <OwnerChoice
          path="policies.advance.kind"
          label="언제까지 단체 예약을 문의할 수 있나요?"
          options={[
            ["UNKNOWN", "미확인"],
            ["SAME_DAY", "당일에도 문의 가능"],
            ["DAYS_BEFORE", "며칠 전 문의 필요"],
            ["NO_FIXED_RULE", "정해진 기준 없음"],
          ]}
          changed={() => setValue("policies.advance.days", null)}
        />
        {p.advance.kind === "DAYS_BEFORE" && (
          <OwnerField
            numeric
            path="policies.advance.days"
            label="방문 며칠 전"
          />
        )}
        <OwnerChoice
          path="policies.minimumOrder.kind"
          label="단체 최소 주문 조건"
          options={[
            ["UNKNOWN", "미확인"],
            ["NONE", "없음"],
            ["AMOUNT", "최소 주문 금액"],
            ["QUANTITY", "최소 주문 수량"],
          ]}
          changed={() => {
            setValue("policies.minimumOrder.amount", null);
            setValue("policies.minimumOrder.quantity", null);
            setValue("policies.minimumOrder.unit", "");
          }}
        />
        {p.minimumOrder.kind === "AMOUNT" && (
          <OwnerField
            numeric
            path="policies.minimumOrder.amount"
            label="최소 주문 금액 (원)"
          />
        )}
        {p.minimumOrder.kind === "QUANTITY" && (
          <>
            <OwnerField
              numeric
              path="policies.minimumOrder.quantity"
              label="최소 주문 수량"
            />
            <OwnerField
              path="policies.minimumOrder.unit"
              label="단위·대상 (예: 메뉴 개)"
            />
          </>
        )}
      </div>
    );
  return (
    <div className="space-y-8">
      {(
        [
          ["menuDeadline", "메뉴는 언제까지 확정해야 하나요?"],
          ["guestDeadline", "언제까지 예약 인원을 변경할 수 있나요?"],
        ] as const
      ).map(([key, label]) => (
        <div className="space-y-3" key={key}>
          <OwnerChoice
            path={`policies.${key}.kind`}
            label={label}
            options={[
              ["UNKNOWN", "미확인"],
              ["ANYTIME", "언제든지 가능"],
              ["DAYS_BEFORE", "방문 며칠 전까지"],
              ["HOURS_BEFORE", "방문 몇 시간 전까지"],
            ]}
            changed={() => setValue(`policies.${key}.value`, null)}
          />
          {["DAYS_BEFORE", "HOURS_BEFORE"].includes(p[key].kind) && (
            <OwnerField
              numeric
              path={`policies.${key}.value`}
              label={p[key].kind === "DAYS_BEFORE" ? "일 전" : "시간 전"}
            />
          )}
        </div>
      ))}
      <OwnerChoice
        path="policies.usage.kind"
        label="이용 시간 제한"
        options={[
          ["UNKNOWN", "미확인"],
          ["NONE", "제한 없음"],
          ["LIMITED", "시간 제한 있음"],
        ]}
        changed={() => setValue("policies.usage.minutes", null)}
      />
      {p.usage.kind === "LIMITED" && (
        <OwnerField
          numeric
          path="policies.usage.minutes"
          label="이용 시간 (분, 2시간 = 120분)"
        />
      )}
      <OwnerChoice
        path="policies.deposit.kind"
        label="예약금"
        options={[
          ["UNKNOWN", "미확인"],
          ["NONE", "없음 (0원)"],
          ["FIXED", "고정 금액"],
          ["PER_RESERVATION", "예약마다 협의"],
        ]}
        changed={(v) =>
          setValue("policies.deposit.amount", v === "NONE" ? 0 : null)
        }
      />
      {p.deposit.kind === "FIXED" && (
        <OwnerField
          numeric
          path="policies.deposit.amount"
          label="예약금 (원)"
        />
      )}
    </div>
  );
}
