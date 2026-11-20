"use client";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { serviceArea } from "@/shared/lib/service-area";
import { FormInput } from "@/shared/ui/form-input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import {
  conditionsSchema,
  type ConditionsValues,
} from "../schemas/conditions.schema";

export function ConditionsForm({
  initial,
  onContinue,
  nextLabel = "매장 선택하기",
  onChange,
}: {
  initial: ConditionsValues;
  onContinue: (values: ConditionsValues) => void;
  nextLabel?: string;
  onChange?: (values: ConditionsValues) => void;
}) {
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
  const [seating, space] = useWatch({ control, name: ["seating", "space"] });
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
        <Select {...attributes} {...register(name)} className="text-base">
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  );
  return (
    <form
      noValidate
      onSubmit={handleSubmit(onContinue)}
      className="space-y-10 rounded-control bg-surface px-[22px] py-7 shadow-card"
    >
      <fieldset className="space-y-4">
        <legend className="mb-4 text-sm font-semibold">
          언제, 몇 명이 함께하나요?
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {input("date", "날짜 (한국 시간)", "date")}
          {input("time", "시작 시간", "time")}
        </div>
        {input(
          "expectedGuests",
          "예상 인원",
          "text",
          true,
          "명단 없이 예상 인원만으로 문의할 수 있어요.",
        )}
        <dl className="space-y-2 text-sm">
          <dt className="text-secondary">희망 지역</dt>
          <dd className="font-semibold">{serviceArea.label}</dd>
        </dl>
      </fieldset>
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
        <legend className="mb-4 text-sm font-semibold">예산과 요청사항</legend>
        <div className="grid grid-cols-2 gap-3">
          {select("budgetBasis", "예산 기준", [
            ["PER_PERSON", "1인당"],
            ["TOTAL", "전체"],
          ])}
          {input("budgetAmount", "예산 (원)", "text", false)}
        </div>
        {select("alcohol", "주류 포함 여부", [
          ["UNKNOWN", "미정"],
          ["INCLUDED", "포함"],
          ["EXCLUDED", "미포함"],
        ])}
        <FormField
          id="inquiry-additionalRequests"
          label="추가 요청사항 (선택)"
          error={errors.additionalRequests?.message}
          className="gap-3 text-xs"
        >
          {(attributes) => (
            <textarea
              {...attributes}
              {...register("additionalRequests")}
              maxLength={1000}
              rows={3}
              placeholder="예: 늦게 합류하는 인원이 있어요"
              className="w-full rounded-[25px] border border-field p-3 text-base"
            />
          )}
        </FormField>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          {input("contactName", "담당자 이름")}
          {input("contactPhone", "담당자 연락처", "tel")}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" className="min-h-[50px] px-5 text-sm">
          {nextLabel}
        </Button>
      </div>
    </form>
  );
}
