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
  });
  const [selection, setAnswer] = useState<AttendanceAnswer | null>(null),
    [editing, setEditing] = useState(false);
  const answer = selection ?? action.access?.response?.selfAnswer;
  const hasSavedAnswer =
    !!action.access?.response?.selfAnswer || action.saved === "REVIEW";
  const showEditor = editing || !hasSavedAnswer;
  const identifying = !action.access || action.access.kind === "MISMATCH";
  const closed =
    info.data?.closed ||
    (action.error instanceof ApiError &&
      action.error.code === "ATTENDANCE_CLOSED");
  const invalid =
    !validShareId(shareId) ||
    (info.error instanceof ApiError &&
      (info.error.status === 404 || info.error.status === 400));
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[402px] flex-col bg-background px-[17px] pt-[max(clamp(24px,7.61svh,72px),env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
      <Image
        src="/images/attendance/brand.svg"
        alt="총무야"
        width={354}
        height={35.9756}
        className="mx-auto max-w-full"
        priority
      />
      {invalid || closed ? (
        <section className="mt-[clamp(96px,20.5svh,194px)] space-y-5 px-[11px] text-center">
          <Image
            src="/images/attendance/link-unavailable.svg"
            alt=""
            width={35}
            height={35}
            className="mx-auto"
          />
          <h1 className="text-xl font-semibold">
            {closed
              ? "참여자 응답이 마감됐어요"
              : "만료되었거나 잘못된 링크예요"}
          </h1>
          <p className="text-xs text-secondary">
            {closed
              ? "변경이 필요하면 총무에게 문의해 주세요."
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
        <div className="flex flex-1 flex-col gap-12 pt-[clamp(48px,15.75svh,149px)]">
          <header
            className="mx-auto w-full max-w-[306px] text-center"
            aria-label={action.access?.response ? "현재 집계 상태" : undefined}
          >
            <div className="mx-auto mb-7 flex size-[60px] items-center justify-center rounded-full bg-brand">
              <Image
                src="/images/attendance/people.svg"
                alt=""
                width={35.3614}
                height={31.1998}
              />
            </div>
            {identifying ? (
              <>
                <h1 className="text-2xl leading-[normal] font-bold break-keep text-foreground">
                  참석자 정보를 입력해 주세요
                </h1>
                <p className="mt-2 text-base leading-normal text-secondary">
                  이름과 뒤 4자리로 내 응답을 확인해요.
                </p>
              </>
            ) : action.access?.response ? (
              <>
                <p className="text-sm text-secondary">현재 참석 상태</p>
                <h1 className="mt-2 text-2xl leading-[normal] font-bold text-foreground">
                  {stateLabel(action.access.response.finalState)}
                </h1>
                {action.access.response.managerOverride !== null && (
                  <p className="mt-2 text-xs text-secondary">
                    총무가 정정한 상태로 집계돼요.
                  </p>
                )}
              </>
            ) : (
              <>
                <h1 className="text-2xl leading-[normal] font-bold text-foreground">
                  총무 확인이 필요해요
                </h1>
                <p className="mt-2 text-sm text-secondary">
                  {action.access?.reason
                    ? reasonLabel(action.access.reason)
                    : "내 응답을 제출해 주세요."}
                </p>
              </>
            )}
          </header>
          <div className="mt-auto space-y-10">
            <section
              className="relative mx-[3px] rounded-[4px] bg-surface px-5 py-4 shadow-card"
              aria-label="참석 행사"
            >
              <h2 className="mb-4 pr-16 text-base leading-[normal] font-medium break-words">
                {info.data.eventName}
              </h2>
              <p className="flex items-center gap-[10px] text-xs text-secondary">
                <Image
                  src="/images/reservations/summary-date.svg"
                  alt=""
                  width={18}
                  height={18}
                />
                {info.data.scheduledAt
                  ? koreanDateLabel(info.data.scheduledAt)
                  : "행사 일정 미정"}
              </p>
              <span className="absolute -top-3 right-[18px] flex min-h-[46px] min-w-[51px] items-center justify-center rounded-pill bg-brand px-3 text-base font-medium text-copy">
                {info.data.roundTitle}
              </span>
            </section>
            {identifying ? (
              <form
                noValidate
                className="space-y-7"
                onSubmit={form.handleSubmit((values) => {
                  setAnswer(null);
                  setEditing(false);
                  action.open(values);
                })}
              >
                <fieldset
                  className="mx-[9px] space-y-7"
                  disabled={action.isPending}
                >
                  <FormField
                    id="attendee-name"
                    label="이름"
                    required
                    error={form.formState.errors.name?.message}
                    labelClassName="sr-only"
                  >
                    {(attributes) => (
                      <Input
                        {...attributes}
                        {...form.register("name")}
                        variant="pill"
                        className="min-h-[46px] border-0 shadow-control aria-invalid:border"
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
                    labelClassName="sr-only"
                    hint="입력한 정보는 행사 명단에서 참여자를 확인하는 데 사용돼요."
                  >
                    {(attributes) => (
                      <Input
                        {...attributes}
                        {...form.register("phoneLast4")}
                        variant="pill"
                        className="min-h-[46px] border-0 shadow-control aria-invalid:border"
                        inputMode="numeric"
                        maxLength={4}
                        autoComplete="off"
                        placeholder="전화번호 뒤 4자리를 입력해 주세요"
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
                <button
                  type="button"
                  className="flex min-h-11 w-full cursor-pointer items-center justify-between px-[9px] text-sm disabled:cursor-wait"
                  aria-label="이름 · 뒤 4자리 다시 입력"
                  disabled={action.isPending}
                  onClick={() => {
                    action.reset();
                    setAnswer(null);
                    setEditing(false);
                  }}
                >
                  <span>
                    {form.getValues("name")} · {form.getValues("phoneLast4")}
                  </span>
                  <span className="text-xs text-secondary">정보 수정</span>
                </button>
                {action.access?.kind === "REVIEW" && (
                  <p className="text-xs text-secondary">
                    확인 전에는 참석 인원에 포함되지 않아요.
                  </p>
                )}
                {hasSavedAnswer && !showEditor && answer && (
                  <p className="text-sm text-secondary">
                    내가 제출한 응답: <strong>{stateLabel(answer)}</strong>
                  </p>
                )}
                {showEditor ? (
                  <>
                    <fieldset
                      disabled={action.isPending}
                      className="flex gap-3"
                    >
                      <legend className="mb-3 text-sm font-semibold">
                        내가 제출할 응답
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
                    {action.access?.response?.managerOverride != null && (
                      <p className="text-xs text-secondary">
                        내 응답을 저장해도 총무의 정정은 유지돼요.
                      </p>
                    )}
                    <FormError
                      message={
                        action.error
                          ? safeErrorMessage(action.error)
                          : undefined
                      }
                    />
                    <Button
                      className="w-full"
                      loading={action.isPending}
                      disabled={!answer}
                      onClick={() => {
                        if (answer)
                          action.save(answer, () => setEditing(false));
                      }}
                    >
                      응답 저장
                    </Button>
                  </>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setEditing(true);
                      action.clearSaved();
                    }}
                  >
                    응답 수정
                  </Button>
                )}
                {action.saved && (
                  <p
                    role="status"
                    className="text-center text-xs text-secondary"
                  >
                    {action.saved === "REVIEW"
                      ? "응답이 접수됐으며 총무 확인이 필요합니다."
                      : "내 응답을 저장했어요."}
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
