"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { IconButton } from "@/shared/ui/icon-button";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { ReplyDateTime } from "./reply-date-time";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { cn } from "@/shared/lib/cn";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import type { ReplyAccess } from "../api/replies.api";
import { useReplyAction } from "../hooks/use-reply-action";
import {
  replyMenuDeadline,
  replySchema,
  type MerchantReplyInput,
} from "../schemas/reply.schema";
import type { MerchantInquiry } from "../types/reply.types";
import { RequestSummary } from "./reply-summary";
import {
  fromKoreanDateInput,
  koreanDateInput,
  koreanDateLabel,
} from "@/shared/lib/korean-date";
function newProposal(q: MerchantInquiry) {
  const proposal: NonNullable<MerchantReplyInput["proposal"]> & {
    menuDeadlineAt?: string | null;
  } = { ...q.defaults.proposal };
  delete proposal.menuDeadlineAt;
  return proposal;
}

function holdDeadline(q: MerchantInquiry, startsAt: string) {
  const endsAt = Math.min(
    Date.parse(startsAt),
    Date.parse(q.snapshot.startsAt),
    replyMenuDeadline(q.defaults.proposal, startsAt) ?? Infinity,
  );
  const preferred = q.defaults.expiresAt
    ? Date.parse(q.defaults.expiresAt)
    : Date.now() + 12 * 3600_000;
  return Number.isFinite(endsAt)
    ? new Date(Math.min(preferred, endsAt - 1000)).toISOString()
    : null;
}

function initial(q: MerchantInquiry): MerchantReplyInput {
  return {
    requestKey: crypto.randomUUID(),
    expectedVersion: q.version,
    kind: "AVAILABLE",
    proposal: newProposal(q),
    expiresAt: holdDeadline(q, q.snapshot.startsAt),
    reason: "",
    holdConfirmed: false,
  };
}
export function ReplyForm({
  inquiry: q,
  access,
  onAccessFailure,
  onBack,
}: {
  inquiry: MerchantInquiry;
  access: ReplyAccess;
  onAccessFailure: () => void;
  onBack?: () => void;
}) {
  const form = useForm<MerchantReplyInput>({
    resolver: zodResolver(replySchema(q.defaults.proposal)),
    defaultValues: initial(q),
  });
  const mutation = useReplyAction(q.targetId, access, onAccessFailure),
    active = useActiveScreen(),
    sending = useRef(false);
  const kind = useWatch({ control: form.control, name: "kind" });
  const [editing, setEditing] = useState(false);
  const [comments, setComments] = useState({ AVAILABLE: "", CHANGE: "" });
  const [otherChanges, setOtherChanges] = useState("");
  const [usageHours, setUsageHours] = useState(() => {
    const minutes = q.defaults.proposal.usageTime?.minutes;
    return minutes == null ? "" : String(minutes / 60);
  });
  const offers = useRef<
    Partial<Record<"AVAILABLE" | "CHANGE", MerchantReplyInput["proposal"]>>
  >({});
  const last = useRef<{ fingerprint: string; key: string } | null>(null);
  const offered = useWatch({ control: form.control, name: "proposal" });
  const deadline = useWatch({ control: form.control, name: "expiresAt" });
  const usage = offered?.usageTime?.kind;
  const proposalErrors = form.formState.errors.proposal;
  function setNotes(conditions: string, comment: string) {
    form.setValue(
      "proposal.note",
      [conditions.trim(), comment.trim()].filter(Boolean).join("\n\n"),
    );
  }
  function chooseKind(v: MerchantReplyInput["kind"]) {
    if (kind !== v) {
      if (kind !== "DECLINE") {
        offers.current[kind] = structuredClone(form.getValues("proposal"));
      }
      form.setValue("kind", v);
      const proposal =
        v === "DECLINE" ? null : (offers.current[v] ?? newProposal(q));
      form.setValue("proposal", proposal);
      form.setValue(
        "expiresAt",
        proposal ? holdDeadline(q, proposal.startsAt) : null,
      );
      form.setValue("holdConfirmed", false);

      form.clearErrors();
    }
    setEditing(true);
  }
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[402px] flex-col bg-background">
      {!editing && (
        <div className="flex flex-1 flex-col px-5 pt-10 pb-6">
          {onBack && (
            <IconButton
              aria-label="받은 문의로 돌아가기"
              onClick={onBack}
              className="mb-3 -ml-2 self-start"
            >
              <Image src="/images/ui/back.svg" alt="" width={10} height={18} />
            </IconButton>
          )}
          {access.kind === "link" && (
            <Image
              src="/images/auth/brand-wordmark-orange.svg"
              alt="총무야"
              width={91}
              height={32}
              className="mb-6 h-auto"
            />
          )}
          <h1 className="text-2xl font-bold">{q.restaurantName} 예약 문의</h1>
          {access.kind === "link" && (
            <p className="my-4 text-xs text-muted">
              예약 문의 답변용 링크입니다. 외부에 공유하지 마세요.
            </p>
          )}
          <section className="rounded-control bg-surface p-5 shadow-card">
            <RequestSummary snapshot={q.snapshot} />
            <p className="mt-3 text-sm">
              현재 담당자: {q.organizerName} {q.organizerMaskedPhone}
            </p>
            {q.contactChangedAt && (
              <p className="text-caption text-muted">
                모임 인수인계로 담당자가 변경됐어요. 원래 문의·답변 기록은
                보존돼요.
              </p>
            )}
          </section>
          <section aria-label="답변 선택" className="mt-auto space-y-2 pt-8">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="brand-outline"
                onClick={() => chooseKind("CHANGE")}
              >
                조건 변경 제안
              </Button>
              <Button onClick={() => chooseKind("AVAILABLE")}>
                요청 조건으로 가능
              </Button>
            </div>
            <button
              type="button"
              className="block min-h-11 w-full text-sm font-medium text-secondary underline underline-offset-4"
              onClick={() => chooseKind("DECLINE")}
            >
              이 문의는 어려워요
            </button>
          </section>
        </div>
      )}
      {editing && (
        <form
          noValidate
          className={cn(
            "flex min-h-svh w-full flex-1 flex-col pt-[57px]",
            kind === "CHANGE"
              ? "pb-[max(20px,env(safe-area-inset-bottom))]"
              : "pb-[max(40px,env(safe-area-inset-bottom))]",
          )}
          onSubmit={(event) =>
            void form.handleSubmit(async (input) => {
              if (sending.current) return;
              if (input.kind !== "DECLINE") input = { ...input, reason: "" };
              sending.current = true;

              const fingerprint = JSON.stringify({
                ...input,
                requestKey: undefined,
              });
              if (last.current?.fingerprint !== fingerprint)
                last.current = { fingerprint, key: crypto.randomUUID() };
              try {
                await mutation.mutateAsync({
                  ...input,
                  requestKey: last.current.key,
                });
                if (active.current) setEditing(false);
              } catch {
                /* Preserve fields and request key for an explicit retry. */
              } finally {
                sending.current = false;
              }
            })(event)
          }
        >
          <IconButton
            aria-label="답변 종류 다시 선택"
            onClick={() => setEditing(false)}
            disabled={mutation.isPending}
            className="mb-[18px] ml-2 self-start"
          >
            <Image
              src="/images/ui/back.svg"
              alt=""
              width={10.4142}
              height={18}
            />
            <span className="sr-only">답변 종류 다시 선택</span>
          </IconButton>
          <fieldset disabled={mutation.isPending} className="min-w-0">
            <legend
              className={
                kind === "AVAILABLE"
                  ? "mx-auto w-[calc(100%-48px)] max-w-[334px] text-2xl leading-tight font-bold text-brand-ink"
                  : "mx-5 text-2xl leading-tight font-bold"
              }
            >
              {kind === "DECLINE"
                ? "어떤 이유로 어려우신가요?"
                : kind === "CHANGE"
                  ? "조건을 바꿔 수락할까요?"
                  : "총무에게 보낼 답변을 써주세요"}
            </legend>
            {kind === "DECLINE" ? (
              <label className="mx-5 mt-7 block space-y-2">
                거절 사유 *
                <textarea
                  {...form.register("reason")}
                  aria-invalid={!!form.formState.errors.reason}
                  aria-describedby="reply-reason-error"
                  className="min-h-24 w-full rounded-control border border-field bg-surface p-3"
                  maxLength={1000}
                />
                <FormError
                  id="reply-reason-error"
                  message={form.formState.errors.reason?.message}
                />
              </label>
            ) : (
              <>
                {kind === "CHANGE" && (
                  <div className="mx-5">
                    <p className="mt-2 text-base leading-snug font-medium">
                      변경한 조건을 총무에게 전달한 뒤 예약을 안내할게요.
                    </p>
                    <section className="mt-8 space-y-8 rounded-card bg-surface py-6 pr-3 pl-4 shadow-card">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                        <h2 className="text-xl leading-tight font-semibold text-brand-ink">
                          변경할 조건
                        </h2>
                        <details className="text-sm open:w-full">
                          <summary className="block cursor-pointer text-right font-semibold text-brand">
                            예약문의 보기
                          </summary>
                          <div className="pt-3">
                            <RequestSummary snapshot={q.snapshot} />
                          </div>
                        </details>
                      </div>
                      <Controller
                        name="proposal.startsAt"
                        control={form.control}
                        render={({ field }) => (
                          <ReplyDateTime
                            value={koreanDateInput(field.value)}
                            onChange={(value) => {
                              const instant = fromKoreanDateInput(value);
                              field.onChange(instant ?? value);
                              form.setValue(
                                "expiresAt",
                                instant ? holdDeadline(q, instant) : null,
                              );
                            }}
                            invalid={!!proposalErrors?.startsAt}
                            onBlur={field.onBlur}
                          />
                        )}
                      />
                      <FormError
                        id="reply-starts-at-error"
                        message={proposalErrors?.startsAt?.message}
                      />
                      <div className="space-y-4">
                        <label className="block space-y-3 text-xs">
                          <span className="block">공간</span>
                          <Select
                            {...form.register("proposal.seating")}
                            className="border-placeholder"
                          >
                            <option value="ANY">상관없음</option>
                            <option value="CLOSE">같은 공간에서 가까이</option>
                            <option value="SEPARATED">분리 착석</option>
                          </Select>
                        </label>
                        <fieldset className="flex flex-wrap gap-5 text-xs">
                          <legend className="sr-only">대관 범위</legend>
                          {(
                            [
                              ["WHOLE", "전체 대관"],
                              ["FLOOR", "한 층 대관"],
                            ] as const
                          ).map(([value, label]) => (
                            <label
                              key={value}
                              className="flex items-center gap-2"
                            >
                              <span className="relative grid size-6 place-items-center">
                                <input
                                  {...form.register("proposal.space")}
                                  type="radio"
                                  value={value}
                                  className="peer size-6 appearance-none rounded-full border border-placeholder checked:border-brand"
                                />
                                <Image
                                  src="/images/merchant-replies/available-check.svg"
                                  alt=""
                                  width={24}
                                  height={24}
                                  className="pointer-events-none absolute hidden peer-checked:block"
                                />
                              </span>
                              {label}
                            </label>
                          ))}
                        </fieldset>
                      </div>
                      <details open className="group space-y-2">
                        <summary className="flex cursor-pointer items-center gap-2 text-base font-medium text-copy">
                          기타 변경 조건
                          <Image
                            src="/images/calendar/field-arrow.svg"
                            alt=""
                            width={8}
                            height={13}
                            className="-rotate-90 group-open:rotate-90"
                          />
                        </summary>
                        <textarea
                          aria-label="기타 변경 조건"
                          className="block h-20 w-full resize-none rounded-card border border-placeholder bg-surface px-4 py-3.5 leading-normal placeholder:text-placeholder"
                          maxLength={100}
                          placeholder="다른 변경 조건이 있다면 입력해주세요."
                          value={otherChanges}
                          onChange={(event) => {
                            setOtherChanges(event.target.value);
                            setNotes(event.target.value, comments.CHANGE);
                          }}
                        />
                        <p className="text-right text-xs leading-tight text-secondary">
                          {otherChanges.length}/100
                        </p>
                      </details>
                    </section>
                  </div>
                )}
                <div className="mx-auto mt-9 w-[calc(100%-48px)] max-w-[334px] space-y-9">
                  <FormField
                    id="reply-deposit"
                    label="예약금"
                    required
                    labelClassName="text-label leading-tight"
                    error={proposalErrors?.deposit?.amount?.message}
                  >
                    {(attrs) => (
                      <Input
                        {...attrs}
                        variant="pill"
                        className="shadow-control"
                        name="proposal.deposit.amount"
                        type="number"
                        min={0}
                        max={2_000_000_000}
                        placeholder="예) 100,000원"
                        aria-label="예약금 (원)"
                        value={offered?.deposit.amount ?? ""}
                        onChange={(event) => {
                          const amount =
                            event.target.value === ""
                              ? null
                              : Number(event.target.value);
                          form.setValue("proposal.deposit", {
                            kind:
                              amount === null
                                ? "UNKNOWN"
                                : amount === 0
                                  ? "NONE"
                                  : "FIXED",
                            amount,
                          });
                        }}
                      />
                    )}
                  </FormField>
                  {kind === "AVAILABLE" && (
                    <div className="space-y-3">
                      <FormField
                        id="reply-usage-hours"
                        label="이용 시간"
                        required
                        className="gap-3"
                        labelClassName="text-label leading-tight"
                        error={proposalErrors?.usageTime?.minutes?.message}
                      >
                        {(attrs) => (
                          <Input
                            {...attrs}
                            variant="pill"
                            className="shadow-control"
                            type="number"
                            step="any"
                            min={0}
                            max={24}
                            inputMode="decimal"
                            name="usageHours"
                            aria-label="이용 시간 (시간 단위)"
                            placeholder="예) 2시간"
                            value={usageHours}
                            disabled={usage === "UNLIMITED"}
                            onChange={(event) => {
                              const value = event.target.value;
                              setUsageHours(value);
                              const minutes =
                                value === ""
                                  ? null
                                  : Math.round(Number(value) * 60);
                              form.setValue("proposal.usageTime", {
                                kind: minutes === null ? "UNKNOWN" : "MINUTES",
                                minutes,
                              });
                            }}
                          />
                        )}
                      </FormField>
                      <label className="flex items-center gap-2 leading-normal">
                        <span className="relative grid size-6 shrink-0 place-items-center">
                          <Checkbox
                            className="peer"
                            checked={usage === "UNLIMITED"}
                            onChange={(event) => {
                              setUsageHours("");
                              form.setValue("proposal.usageTime", {
                                kind: event.target.checked
                                  ? "UNLIMITED"
                                  : "UNKNOWN",
                                minutes: null,
                              });
                            }}
                          />
                          <Image
                            src="/images/merchant-replies/available-check.svg"
                            alt=""
                            width={24}
                            height={24}
                            className="pointer-events-none absolute inset-0 hidden peer-checked:block"
                          />
                        </span>
                        자유롭게 이용 가능해요
                      </label>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label
                      htmlFor="reply-merchant-comment"
                      className="block text-label leading-tight text-copy"
                    >
                      사장님 한마디
                    </label>
                    <textarea
                      id="reply-merchant-comment"
                      name="proposal.note"
                      aria-invalid={!!proposalErrors?.note}
                      aria-describedby="reply-note-error"
                      className="block h-[100px] w-full resize-none rounded-card bg-surface px-4 py-3.5 leading-normal shadow-control placeholder:text-placeholder"
                      placeholder={`${offered?.expectedGuests ?? q.snapshot.expectedGuests}명 한 공간으로 준비해 드릴게요.`}
                      maxLength={100}
                      value={comments[kind]}
                      onChange={(event) => {
                        const value = event.target.value;
                        setComments((old) => ({ ...old, [kind]: value }));
                        setNotes(kind === "CHANGE" ? otherChanges : "", value);
                      }}
                    />
                    <p className="text-right text-xs leading-tight text-secondary">
                      {comments[kind].length}/100
                    </p>
                    <FormError
                      id="reply-note-error"
                      message={proposalErrors?.note?.message}
                    />
                  </div>
                  <div>
                    <label className="flex items-start gap-3 rounded-[10px] bg-[#fef3ec] p-3.5 leading-tight shadow-control">
                      <span className="relative grid size-5 shrink-0 place-items-center">
                        <Checkbox
                          {...form.register("holdConfirmed")}
                          aria-invalid={!!form.formState.errors.holdConfirmed}
                          aria-describedby="reply-hold-error"
                          className="peer size-5 rounded-[6px] checked:bg-brand checked:shadow-none"
                        />
                        <Image
                          src="/images/merchant-replies/hold-check.svg"
                          alt=""
                          width={14}
                          height={14}
                          className="pointer-events-none absolute hidden peer-checked:block"
                        />
                      </span>
                      <span className="font-medium">
                        이 날짜·시간에{" "}
                        {offered?.expectedGuests ?? q.snapshot.expectedGuests}명
                        자리를 비워둘게요
                        <span className="mt-1 block text-xs font-normal break-keep text-muted">
                          {deadline ? (
                            <>
                              <time dateTime={deadline}>
                                {koreanDateLabel(deadline)}
                              </time>
                              (한국 시간)까지 필요한 좌석을 유지해요.
                            </>
                          ) : (
                            "선택 기한까지 필요한 좌석을 유지해요."
                          )}
                        </span>
                      </span>
                    </label>
                    <FormError
                      id="reply-hold-error"
                      message={
                        form.formState.errors.holdConfirmed?.message ??
                        form.formState.errors.expiresAt?.message
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </fieldset>
          <div className="mx-[17px] mt-auto space-y-2 pt-8">
            <FormError
              message={
                mutation.error ? safeErrorMessage(mutation.error) : undefined
              }
            />
            <Button
              type="submit"
              className="w-full"
              loading={mutation.isPending}
            >
              답변 보내기
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
