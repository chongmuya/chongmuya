"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/shared/ui/input";
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
}: {
  initial: ConditionsValues;
  onContinue: (values: ConditionsValues) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(conditionsSchema),
    defaultValues: initial,
  });
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
      className="min-w-0 text-xs"
    >
      {(attributes) => (
        <Input
          {...attributes}
          {...register(name)}
          type={type}
          inputMode={
            name === "expectedGuests" || name === "budgetAmount"
              ? "numeric"
              : undefined
          }
          className="min-w-0 rounded-pill border-border"
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
      className="text-xs"
    >
      {(attributes) => (
        <Select
          {...attributes}
          {...register(name)}
          className="rounded-pill border-border text-base"
        >
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
      className="space-y-8 rounded-control bg-surface px-5 py-7 shadow-card"
    >
      <fieldset className="space-y-4">
        <legend className="mb-4 text-base font-semibold">
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
        {input("region", "희망 지역")}
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-4 text-base font-semibold">
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
        <legend className="mb-4 text-base font-semibold">
          예산과 요청사항
        </legend>
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
          className="text-xs"
        >
          {(attributes) => (
            <textarea
              {...attributes}
              {...register("additionalRequests")}
              maxLength={1000}
              rows={4}
              placeholder="예: 늦게 합류하는 인원이 있어요"
              className="w-full rounded-control border border-border p-3 text-base"
            />
          )}
        </FormField>
        {input("contactName", "담당자 이름")}
        {input(
          "contactPhone",
          "담당자 연락처",
          "tel",
          true,
          "하이픈 없이 입력해 주세요. 가입 연락처와 다른 번호를 입력해도 인증 완료로 처리하지 않아요.",
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-4 text-base font-semibold">
          매장을 찾는 방법
        </legend>
        <div className="rounded-control border border-brand bg-brand/10 p-4">
          <h3 className="text-sm font-semibold">가게를 선택해 문의해요</h3>
          <p className="mt-1 text-xs">1~3곳에 같은 조건을 전달할 수 있어요.</p>
        </div>
        <Button
          disabled
          variant="outline"
          className="w-full rounded-control text-sm"
        >
          사장님 제안받기 · 준비 중
        </Button>
      </fieldset>
      <Button type="submit" className="w-full">
        조건으로 매장 찾기 →
      </Button>
    </form>
  );
}
