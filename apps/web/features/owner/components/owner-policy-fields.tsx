"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import {
  OwnerChoice,
  OwnerField,
  OwnerRadio,
  OwnerUnknownButton,
} from "./owner-fields";
import { cn } from "@/shared/lib/cn";
import type { RegistrationData } from "../schemas/registration.schema";

const deadlineOptions = [
  ["DAYS_BEFORE", "방문 며칠 전까지"],
  ["HOURS_BEFORE", "방문 몇 시간 전까지"],
  ["ANYTIME", "언제든지 변경할 수 있어요"],
  ["UNKNOWN", "미확인"],
] as const;

function normalizeTime(value: string) {
  if (/^\d{3,4}$/.test(value)) {
    const digits = value.padStart(4, "0");
    return digits.slice(0, 2) + ":" + digits.slice(2);
  }
  return /^\d:\d{2}$/.test(value) ? "0" + value : value;
}

function TradingHours() {
  const { control, getValues, setValue } = useFormContext<RegistrationData>();
  const hours = useWatch({ control, name: "policies.hours" });
  const id = useId();
  function change(key: "start" | "end", value: string) {
    const current = getValues("policies.hours");
    const range = {
      start: current?.start ?? "",
      end: current?.end ?? "",
      [key]: value,
    };
    const clockTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    const overnight =
      clockTime.test(range.start) &&
      clockTime.test(range.end) &&
      range.end < range.start;
    setValue(
      "policies.hours",
      range.start || range.end
        ? { ...range, endDayOffset: overnight ? 1 : 0 }
        : null,
    );
  }
  function timeField(key: "start" | "end", label: string, placeholder: string) {
    return (
      <Controller
        control={control}
        name={`policies.hours.${key}`}
        render={({ field, fieldState }) => (
          <FormField
            id={`${id}-${key}`}
            label={label}
            labelClassName="sr-only"
            error={fieldState.error?.message}
          >
            {(attributes) => (
              <Input
                {...attributes}
                variant="pill"
                className="shadow-control"
                name={field.name}
                ref={field.ref}
                inputMode="numeric"
                maxLength={5}
                placeholder={placeholder}
                value={field.value ?? ""}
                onBlur={() => {
                  const raw = getValues(`policies.hours.${key}`) ?? "";
                  const formatted = normalizeTime(raw.trim());
                  if (formatted !== raw) change(key, formatted);
                  field.onBlur();
                }}
                onChange={(event) => {
                  const text = event.target.value;
                  change(
                    key,
                    /^\d{4}$/.test(text) ? normalizeTime(text) : text,
                  );
                }}
              />
            )}
          </FormField>
        )}
      />
    );
  }
  return (
    <fieldset>
      <legend className="mb-2 text-label text-copy/80">대표 영업 시간</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        {timeField("start", "시작 시간", "17:00")}
        <Image
          className="mt-[22px]"
          src="/images/owner-registration/time-divider.svg"
          width={9}
          height={2}
          style={{ width: 9, height: "auto" }}
          alt=""
        />
        {timeField("end", "종료 시간", "24:00")}
      </div>
      {hours?.endDayOffset === 1 && (
        <p role="status" className="mt-2 text-xs text-muted">
          다음 날 {hours.end}에 영업을 마쳐요.
        </p>
      )}
      <p className="mt-2 text-xs text-copy/80">
        요일별로 운영시간이 다르면 등록 후{" "}
        <span className="text-brand">매장 관리 → 영업시간</span>에서 상세 시간을
        설정할 수 있어요.
      </p>
    </fieldset>
  );
}

function DeadlineValue({
  fieldName,
  unit,
}: {
  fieldName: "menuDeadline" | "guestDeadline";
  unit: "일" | "시간";
}) {
  const { control } = useFormContext<RegistrationData>();
  const [custom, setCustom] = useState(false);
  const id = useId();
  const path = `policies.${fieldName}.value` as const;
  const accessibleLabel =
    fieldName === "menuDeadline" ? "메뉴 확정 기한" : "인원 변경 기한";
  if (custom)
    return (
      <OwnerField
        path={path}
        numeric
        label={`${accessibleLabel} (${unit} 전)`}
      />
    );
  const values = Array.from(
    { length: unit === "일" ? 31 : 48 },
    (_, i) => i + 1,
  );
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <FormField
          id={id}
          label={accessibleLabel}
          labelClassName="sr-only"
          error={fieldState.error?.message}
        >
          {(attributes) => (
            <div className="flex items-center gap-2 text-control">
              <div className="relative inline-flex items-center">
                <select
                  {...attributes}
                  className={cn(
                    "h-input w-[61px] appearance-none rounded-pill bg-surface px-3 pr-6 text-control shadow-control",
                    field.value && field.value > 99 && "w-[96px]",
                  )}
                  name={field.name}
                  ref={field.ref}
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChange={(event) => {
                    if (event.target.value === "custom") setCustom(true);
                    else
                      field.onChange(
                        event.target.value ? Number(event.target.value) : null,
                      );
                  }}
                >
                  <option value="">—</option>
                  {field.value && !values.includes(field.value) && (
                    <option value={field.value}>{field.value}</option>
                  )}
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                  <option value="custom">직접 입력</option>
                </select>
                <Image
                  className="pointer-events-none absolute right-2.5 rotate-180"
                  src="/images/owner-registration/deadline-arrow.svg"
                  width={10}
                  height={7}
                  style={{ width: 10.3188, height: "auto" }}
                  alt=""
                />
              </div>
              <span aria-hidden="true">{unit} 전</span>
            </div>
          )}
        </FormField>
      )}
    />
  );
}

export function OwnerPolicyFields({ step }: { step: 2 | 3 }) {
  const { control, setValue } = useFormContext<RegistrationData>();
  const p = useWatch({ control, name: "policies" });
  const hasDeposit =
    p.deposit.kind === "FIXED" || p.deposit.kind === "PER_RESERVATION";
  if (step === 2)
    return (
      <div className="space-y-9">
        <TradingHours />
        <div className="space-y-2">
          <OwnerChoice
            path="policies.holidays.kind"
            compactUnknown
            label="정기 휴무일"
            options={[
              ["NONE", "정기 휴무 없음"],
              ["WEEKLY", "요일별 정기 휴무"],
              ["IRREGULAR", "비정기 휴무"],
              ["UNKNOWN", "미확인"],
            ]}
            changed={() => {
              setValue("policies.holidays.weekdays", []);
              setValue("policies.holidays.note", "");
            }}
          />
          {p.holidays.kind === "WEEKLY" && (
            <fieldset>
              <legend className="mb-2 text-xs text-copy/80">
                정기 휴무 요일을 선택해 주세요.
              </legend>
              <div className="grid grid-cols-7 gap-1">
                {(
                  [
                    ["월", 1],
                    ["화", 2],
                    ["수", 3],
                    ["목", 4],
                    ["금", 5],
                    ["토", 6],
                    ["일", 0],
                  ] as const
                ).map(([day, i]) => (
                  <label
                    key={day}
                    className="grid cursor-pointer place-items-center"
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={p.holidays.weekdays.includes(i)}
                      onChange={(event) =>
                        setValue(
                          "policies.holidays.weekdays",
                          event.target.checked
                            ? [...p.holidays.weekdays, i]
                            : p.holidays.weekdays.filter(
                                (value) => value !== i,
                              ),
                        )
                      }
                    />
                    <span className="grid aspect-square max-h-12 w-full max-w-12 place-items-center rounded-full border border-transparent bg-surface text-sm shadow-control peer-checked:border-brand peer-checked:bg-choice peer-focus-visible:focus-outline">
                      {day}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {p.holidays.kind === "IRREGULAR" && (
            <OwnerField
              path="policies.holidays.note"
              label="비정기 휴무 안내"
            />
          )}
        </div>
        <div className="space-y-3">
          <OwnerChoice
            path="policies.advance.kind"
            compactUnknown
            label="언제까지 단체 예약을 받을 수 있나요?"
            options={[
              ["SAME_DAY", "당일에도 예약할 수 있어요"],
              ["DAYS_BEFORE", "며칠 전 문의해야 해요"],
              ["NO_FIXED_RULE", "정해진 기준이 없어요"],
              ["UNKNOWN", "미확인"],
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
        </div>
        <div className="space-y-3">
          <OwnerChoice
            path="policies.minimumOrder.kind"
            compactUnknown
            label="단체 최소 주문 조건이 있나요?"
            options={[
              ["NONE", "없음"],
              ["AMOUNT", "최소 주문 금액 있음"],
              ["QUANTITY", "최소 주문 수량 있음"],
              ["UNKNOWN", "미확인"],
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
      </div>
    );
  return (
    <div className="space-y-9">
      {(
        [
          ["menuDeadline", "메뉴는 언제까지 확정해야 하나요?"],
          ["guestDeadline", "언제까지 예약 인원을 변경할 수 있나요?"],
        ] as const
      ).map(([key, label]) => (
        <div className="space-y-3" key={key}>
          <OwnerChoice
            path={`policies.${key}.kind`}
            compactUnknown
            label={label}
            options={deadlineOptions}
            changed={() => setValue(`policies.${key}.value`, null)}
          />
          {(p[key].kind === "DAYS_BEFORE" ||
            p[key].kind === "HOURS_BEFORE") && (
            <DeadlineValue
              key={p[key].kind}
              fieldName={key}
              unit={p[key].kind === "DAYS_BEFORE" ? "일" : "시간"}
            />
          )}
        </div>
      ))}
      <div className="space-y-3">
        <OwnerChoice
          path="policies.usage.kind"
          compactUnknown
          label="이용 시간에 제한이 있나요?"
          options={[
            ["NONE", "없음"],
            ["LIMITED", "있음"],
            ["UNKNOWN", "미확인"],
          ]}
          inline
          changed={() => setValue("policies.usage.minutes", null)}
        />
        {p.usage.kind === "LIMITED" && (
          <OwnerField
            numeric
            path="policies.usage.minutes"
            label="이용 시간 (분)"
            placeholder="예) 120"
          />
        )}
      </div>
      <div className="space-y-3">
        <fieldset>
          <legend className="mb-3 text-label text-copy/80">
            예약금이 있나요?
          </legend>
          <div className="flex flex-wrap items-end gap-x-9 gap-y-2 text-control">
            <OwnerRadio
              name="hasDeposit"
              checked={p.deposit.kind === "NONE"}
              onChange={() =>
                setValue("policies.deposit", { kind: "NONE", amount: 0 })
              }
            >
              없음
            </OwnerRadio>
            <OwnerRadio
              name="hasDeposit"
              checked={hasDeposit}
              onChange={() =>
                setValue("policies.deposit", { kind: "FIXED", amount: null })
              }
            >
              있음
            </OwnerRadio>
            {p.deposit.kind !== "UNKNOWN" && (
              <div className="ml-auto">
                <OwnerUnknownButton
                  label="예약금"
                  onClick={() =>
                    setValue("policies.deposit", {
                      kind: "UNKNOWN",
                      amount: null,
                    })
                  }
                />
              </div>
            )}
          </div>
        </fieldset>
        {hasDeposit && (
          <OwnerChoice
            path="policies.deposit.kind"
            label="예약금은 어떻게 정하시나요?"
            legendClassName="mb-2 text-xs font-normal"
            options={[
              ["FIXED", "항상 같은 금액을 받아요"],
              ["PER_RESERVATION", "예약에 따라 금액을 정해요"],
            ]}
            changed={() => setValue("policies.deposit.amount", null)}
          />
        )}
        {p.deposit.kind === "FIXED" && (
          <OwnerField
            numeric
            path="policies.deposit.amount"
            label="예약금 (원)"
            hideLabel
            placeholder="예약금 (원)"
          />
        )}
      </div>
    </div>
  );
}
