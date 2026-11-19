"use client";
import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { personFields } from "@/features/roster/client";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import { LoadingState, ErrorState } from "@/shared/ui/states";
import { ApiError } from "@/shared/http/api-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { publicAttendanceQuery, validShareId } from "../api/attendance.api";
import { usePublicAttendance } from "../hooks/use-public-attendance";
import { stateLabel, reasonLabel } from "../lib/attendance-labels";
import type { AttendanceAnswer } from "../types/attendance.types";
const identitySchema = z.object({
  name: personFields.name,
  phoneLast4: z
    .string()
    .regex(/^[0-9]{4}$/, "전화번호 뒤 4자리를 입력해 주세요."),
});
export function PublicAttendance({ shareId }: { shareId: string }) {
  const info = useQuery(publicAttendanceQuery(shareId)),
    action = usePublicAttendance(shareId);
  const form = useForm({
      resolver: zodResolver(identitySchema),
      defaultValues: { name: "", phoneLast4: "" },
    }),
    [selection, setAnswer] = useState<AttendanceAnswer | null>(null);
  const answer = selection ?? action.access?.response?.selfAnswer;
  const closed =
    info.data?.closed ||
    (action.error instanceof ApiError &&
      action.error.code === "ATTENDANCE_CLOSED");
  const invalid =
    !validShareId(shareId) ||
    (info.error instanceof ApiError &&
      (info.error.status === 404 || info.error.status === 400));
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[402px] flex-col bg-background px-5 pt-8 pb-[max(24px,env(safe-area-inset-bottom))]">
      <Image
        src="/images/attendance/brand.svg"
        alt="총무야"
        width={354}
        height={36}
        className="h-auto w-full"
        priority
      />
      {invalid || closed ? (
        <section className="my-auto space-y-5 py-16 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-soft">
            <Image
              src="/images/attendance/unavailable.svg"
              alt=""
              width={18}
              height={18}
            />
          </div>
          <h1 className="text-xl font-semibold">
            {closed ? "참여자 응답이 마감됐어요" : "사용할 수 없는 링크예요"}
          </h1>
          <p className="text-xs text-muted">
            {closed
              ? "참여자의 제출과 수정이 종료됐어요. 변경이 필요하면 총무에게 문의해 주세요."
              : "총무에게 참석 응답 링크를 다시 받아 주세요."}
          </p>
        </section>
      ) : info.isError && !info.data ? (
        <div className="my-auto">
          <ErrorState retry={() => void info.refetch()}>
            {safeErrorMessage(info.error)}
          </ErrorState>
        </div>
      ) : !info.data ? (
        <LoadingState>참석 링크 확인 중…</LoadingState>
      ) : (
        <div className="my-auto py-8">
          <div className="space-y-7 rounded-control bg-surface p-5 shadow-card">
            <header className="space-y-2 text-center">
              <h1 className="text-2xl leading-normal font-bold text-foreground">
                {action.access && action.access.kind !== "MISMATCH"
                  ? "내 참석 응답"
                  : "참여자 정보"}
              </h1>
              <p className="text-base leading-normal text-copy/80">
                이름과 전화번호 뒤 4자리로
                <br />내 응답을 열고 수정할 수 있어요.
              </p>
            </header>
            <section
              className="rounded-control bg-background px-4 py-3"
              aria-label="참석 행사"
            >
              <h2 className="text-sm font-semibold break-words">
                {info.data.eventName} · {info.data.roundTitle}
              </h2>
              <p className="mt-1 text-xs text-secondary">
                {info.data.scheduledAt
                  ? koreanDateLabel(info.data.scheduledAt)
                  : "행사 일정 미정"}
              </p>
            </section>
            {!action.access || action.access.kind === "MISMATCH" ? (
              <form
                noValidate
                className="space-y-7"
                onSubmit={form.handleSubmit((values) => {
                  setAnswer(null);
                  action.open(values);
                })}
              >
                <fieldset className="space-y-5" disabled={action.isPending}>
                  <FormField
                    id="attendee-name"
                    label="이름"
                    required
                    error={form.formState.errors.name?.message}
                    labelClassName="text-xs text-secondary"
                  >
                    {(attributes) => (
                      <Input
                        {...attributes}
                        {...form.register("name")}
                        variant="form"
                        autoComplete="off"
                        placeholder="이름을 입력해 주세요"
                      />
                    )}
                  </FormField>
                  <FormField
                    id="attendee-phone"
                    label="전화번호 뒤 4자리"
                    required
                    error={form.formState.errors.phoneLast4?.message}
                    labelClassName="text-xs text-secondary"
                  >
                    {(attributes) => (
                      <Input
                        {...attributes}
                        {...form.register("phoneLast4")}
                        variant="form"
                        inputMode="numeric"
                        maxLength={4}
                        autoComplete="off"
                        placeholder="뒤 4자리를 입력해 주세요"
                      />
                    )}
                  </FormField>
                </fieldset>
                {action.access?.kind === "MISMATCH" && (
                  <p role="alert" className="text-sm text-danger">
                    입력한 이름과 뒤 4자리를 확인해 주세요.
                  </p>
                )}
                <FormError
                  message={
                    action.error ? safeErrorMessage(action.error) : undefined
                  }
                />
                <Button
                  type="submit"
                  className="w-full"
                  loading={action.isPending}
                >
                  내 응답 열기
                </Button>
              </form>
            ) : (
              <section className="space-y-5">
                <p className="text-sm">
                  {form.getValues("name")} · {form.getValues("phoneLast4")}
                </p>
                {action.access.kind === "REVIEW" && (
                  <div className="rounded-control bg-surface p-5 text-sm">
                    <p>
                      {action.access.reason
                        ? reasonLabel(action.access.reason)
                        : "총무의 연결 확인이 필요해요"}
                      .
                    </p>
                    <p className="mt-2">
                      응답을 제출하면 총무가 확인해요. 확인 전에는 참석 인원에
                      포함되지 않아요.
                    </p>
                  </div>
                )}
                {action.access.response && (
                  <div className="space-y-2 rounded-control bg-surface p-5 text-sm">
                    <p>
                      현재 참석 상태 ·{" "}
                      {stateLabel(action.access.response.finalState)}
                    </p>
                    {action.access.response.managerOverride !== null && (
                      <p className="text-xs">총무가 정정한 상태로 집계돼요.</p>
                    )}
                  </div>
                )}
                <fieldset disabled={action.isPending} className="flex gap-3">
                  <legend className="mb-3 text-sm font-semibold">
                    내 응답 선택
                  </legend>
                  {(["ATTENDING", "ABSENT"] as const).map((value) => (
                    <label
                      key={value}
                      className={cn(
                        "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-pill border",
                        answer === value
                          ? "border-brand bg-brand/10"
                          : "border-field bg-surface",
                      )}
                    >
                      <input
                        type="radio"
                        name="attendance-answer"
                        checked={answer === value}
                        onChange={() => {
                          setAnswer(value);
                          action.clearSaved();
                        }}
                      />
                      {stateLabel(value)}
                    </label>
                  ))}
                </fieldset>
                <FormError
                  message={
                    action.error ? safeErrorMessage(action.error) : undefined
                  }
                />
                {action.saved && (
                  <p
                    role="status"
                    className="rounded-control bg-surface p-4 text-sm"
                  >
                    {action.saved === "REVIEW"
                      ? "응답이 접수됐으며 총무 확인이 필요합니다."
                      : "내 응답을 저장했어요."}
                  </p>
                )}
                <Button
                  className="w-full"
                  loading={action.isPending}
                  disabled={!answer}
                  onClick={() => {
                    if (answer) action.save(answer);
                  }}
                >
                  응답 저장
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => {
                    action.reset();
                    setAnswer(null);
                  }}
                >
                  이름 · 뒤 4자리 다시 입력
                </Button>
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
