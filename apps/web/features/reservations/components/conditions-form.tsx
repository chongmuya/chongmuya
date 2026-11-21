"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { serviceArea } from "@/shared/lib/service-area";
import { FormInput } from "@/shared/ui/form-input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { ConditionSummary } from "./condition-summary";
import {
  conditionsSchema,
  type ConditionsValues,
} from "../schemas/conditions.schema";

export function ConditionsForm({
  initial,
  savedStartsAt,
  groupType,
  onContinue,
  nextLabel = "매장 선택하기",
  onChange,
}: {
  initial: ConditionsValues;
  savedStartsAt?: string;
  groupType?: string | null;
  onContinue: (values: ConditionsValues) => void;
  nextLabel?: string;
  onChange?: (values: ConditionsValues) => void;
}) {
  const [editGuests, setEditGuests] = useState(!initial.expectedGuests);
  const {
    register,
    subscribe,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(conditionsSchema),
    defaultValues: initial,
  });
  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => onChange?.(values),
    });
  }, [subscribe, onChange]);
  const [seating, space, budgetAmount] = useWatch({
    control,
    name: ["seating", "space", "budgetAmount"],
  });
  const input = (
    name: keyof ConditionsValues,
    label: string,
    type = "text",
    required = true,
    hint?: string,
  ) => (
    <FormField
      id={`inquiry-${name}`}
      label={label}
      required={required}
      error={errors[name]?.message}
      hint={hint}
      className="min-w-0 gap-3 text-xs"
    >
      {(attributes) => (
        <FormInput
          {...attributes}
          control={control}
          name={name}
          type={type}
          inputMode={
            name === "expectedGuests" || name === "budgetAmount"
              ? "numeric"
              : undefined
          }
          variant="form"
          className="min-w-0"
        />
      )}
    </FormField>
  );
  const select = (
    name: keyof ConditionsValues,
    label: string,
    options: [string, string][],
  ) => (
    <FormField
      id={`inquiry-${name}`}
      label={label}
      error={errors[name]?.message}
      className="gap-3 text-xs"
    >
      {(attributes) => (
        <div className="relative">
          <Select
            {...attributes}
            {...register(name)}
            className="appearance-none pr-9 text-base"
          >
            {options.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
          <Image
            src="/images/calendar/field-arrow.svg"
            alt=""
            width={8}
            height={13}
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 -rotate-90"
          />
        </div>
      )}
    </FormField>
  );
  return (
    <>
      <div className="mb-7">
        <ConditionSummary
          conditions={{
            expectedGuests:
              !editGuests && initial.expectedGuests
                ? Number(initial.expectedGuests)
                : null,
            startsAt: savedStartsAt ?? null,
            region: serviceArea.label,
          }}
        />
      </div>
      <form
        noValidate
        onSubmit={handleSubmit(onContinue)}
        className="space-y-10 rounded-control bg-surface px-[22px] py-7 shadow-card"
      >
        <div className="space-y-4">
          {!savedStartsAt ? (
            <div className="grid grid-cols-2 gap-3">
              {input("date", "날짜 (한국 시간)", "date")}
              {input("time", "시작 시간", "time")}
            </div>
          ) : (
            <FormError message={errors.date?.message} />
          )}
          {editGuests ? (
            input(
              "expectedGuests",
              "예상 인원",
              "text",
              true,
              "명단 없이 예상 인원만으로 문의할 수 있어요.",
            )
          ) : (
            <button
              type="button"
              className="min-h-8 text-xs font-medium text-link underline underline-offset-4"
              onClick={() => setEditGuests(true)}
            >
              예상 인원 변경
            </button>
          )}
          <dl className="space-y-4 text-xs">
            {groupType && (
              <div className="space-y-3">
                <dt>모임 유형</dt>
                <dd className="flex min-h-input items-center rounded-pill border border-field px-3 text-sm text-secondary">
                  {groupType}
                </dd>
              </div>
            )}
            <div className="space-y-3">
              <dt>희망 지역</dt>
              <dd className="flex min-h-input items-center rounded-pill border border-field bg-soft px-3 text-sm text-secondary">
                {serviceArea.label}
              </dd>
            </div>
          </dl>
        </div>
        <fieldset className="space-y-4">
          <legend className="mb-4 text-sm font-semibold">
            어떻게 앉고 싶나요?
          </legend>
          {select("seating", "함께 착석할 필요", [
            ["ANY", "상관없음"],
            ["CLOSE", "같은 공간에서 가까이"],
            ["SEPARATED", "떨어져도 가능"],
          ])}
          {seating !== "ANY" &&
            select("seatingImportance", "착석 조건 중요도", [
              ["PREFERRED", "가능하면 희망"],
              ["REQUIRED", "꼭 필요"],
            ])}
          {select("space", "공간 이용 방식", [
            ["ANY", "상관없음"],
            ["HALL", "일반 홀"],
            ["ROOM", "별도 룸"],
            ["FLOOR", "한 층 단독 대관"],
            ["WHOLE", "전체 단독 대관"],
          ])}
          {space !== "ANY" &&
            select("spaceImportance", "공간 조건 중요도", [
              ["PREFERRED", "가능하면 희망"],
              ["REQUIRED", "꼭 필요"],
            ])}
          <p className="text-xs text-muted">
            일반 홀에서 함께 앉는 것과 다른 손님 없이 대관하는 것은 달라요.
          </p>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="mb-4 text-sm font-semibold">
            예산과 요청사항 (선택)
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {select("budgetBasis", "예산 기준", [
              ["PER_PERSON", "1인당"],
              ["TOTAL", "전체"],
            ])}
            {input("budgetAmount", "예산 (원)", "text", false)}
          </div>
          {!!budgetAmount &&
            select("alcohol", "주류 포함 여부", [
              ["UNKNOWN", "미정"],
              ["INCLUDED", "포함"],
              ["EXCLUDED", "미포함"],
            ])}
          <FormField
            id="inquiry-additionalRequests"
            label="추가 요청사항"
            error={errors.additionalRequests?.message}
            className="gap-3 text-xs"
          >
            {(attributes) => (
              <textarea
                {...attributes}
                {...register("additionalRequests")}
                maxLength={1000}
                rows={3}
                placeholder="예: 일부 인원이 늦게 합류해요"
                className="w-full resize-y rounded-[25px] border border-field px-3 py-3 text-base placeholder:text-placeholder focus:not-aria-invalid:border-brand focus:not-aria-invalid:outline-none"
              />
            )}
          </FormField>
        </fieldset>
        <div className="-mt-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {input("contactName", "담당자 이름")}
            {input("contactPhone", "담당자 연락처", "tel")}
          </div>
          <p className="text-xs text-muted">
            매장 답변과 예약 진행 안내를 받을 연락처예요.
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-3 text-sm font-semibold">
            매장을 찾는 방법
          </legend>
          <label className="relative flex min-h-20 items-center justify-between gap-3 rounded-control border border-brand bg-choice px-3 py-4 has-focus-visible:focus-outline">
            <input
              className="choice-card-radio"
              type="radio"
              name="findingMethod"
              defaultChecked
            />
            <span>
              <span className="block text-sm font-semibold">
                가게를 선택해 문의해요
              </span>
              <span className="mt-1 block text-xs">
                3곳에 같은 조건을 전달할 수 있어요.
              </span>
            </span>
            <Image
              src="/images/restaurants/radio-on.svg"
              alt=""
              width={26}
              height={26}
            />
          </label>
          <label className="relative flex min-h-14 items-center justify-between gap-3 rounded-control bg-soft px-3 py-3 text-xs text-secondary">
            <input
              className="choice-card-radio"
              type="radio"
              name="findingMethod"
              disabled
            />
            <span className="flex flex-wrap items-center gap-2">
              <span>사장님 제안 받기 (역경매)</span>
              <span className="rounded bg-field px-2 py-0.5 text-xs">
                준비 중
              </span>
            </span>
            <Image
              src="/images/restaurants/radio-off.svg"
              alt=""
              width={26}
              height={26}
            />
          </label>
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit" className="min-h-[50px] px-5 text-sm">
            {nextLabel}
            <span aria-hidden="true">→</span>
          </Button>
        </div>
      </form>
    </>
  );
}
