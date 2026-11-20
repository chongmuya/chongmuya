"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { IconButton } from "@/shared/ui/icon-button";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { DateTimePicker } from "@/shared/ui/date-time-picker";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
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
import { RequestSummary, spaceLabel, seatingLabel } from "./reply-summary";
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

function initial(q: MerchantInquiry): MerchantReplyInput {
  return {
    requestKey: crypto.randomUUID(),
    expectedVersion: q.version,
    kind: "AVAILABLE",
    proposal: newProposal(q),
    expiresAt: q.defaults.expiresAt,
    reason: "",
    holdConfirmed: false,
  };
}
export function ReplyForm({
  inquiry: q,
  access,
  onAccessFailure,
}: {
  inquiry: MerchantInquiry;
  access: ReplyAccess;
  onAccessFailure: () => void;
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
  const offers = useRef<
    Partial<Record<"AVAILABLE" | "CHANGE", MerchantReplyInput["proposal"]>>
  >({});
  const previousDeadline = useRef(q.defaults.expiresAt);
  const last = useRef<{ fingerprint: string; key: string } | null>(null);
  const offered = useWatch({ control: form.control, name: "proposal" });
  const deposit = offered?.deposit.kind ?? "UNKNOWN";
  const deadline = useWatch({ control: form.control, name: "expiresAt" });
  const usage = offered?.usageTime?.kind;
  const menuDeadline = offered
    ? replyMenuDeadline(q.defaults.proposal, offered.startsAt)
    : null;
  function chooseKind(v: MerchantReplyInput["kind"]) {
    if (kind !== v) {
      if (kind !== "DECLINE") {
        offers.current[kind] = structuredClone(form.getValues("proposal"));
        previousDeadline.current = form.getValues("expiresAt");
      }
      form.setValue("kind", v);
      form.setValue(
        "proposal",
        v === "DECLINE" ? null : (offers.current[v] ?? newProposal(q)),
      );
      form.setValue(
        "expiresAt",
        v === "DECLINE" ? null : previousDeadline.current,
      );
      form.setValue("holdConfirmed", false);

      form.clearErrors();
    }
    setEditing(true);
  }
  return (
    <>
      {!editing && (
        <>
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
        </>
      )}
      {editing && (
        <form
          noValidate
          className="mx-auto flex w-full max-w-[362px] flex-col gap-5"
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
            className="-ml-2 self-start"
          >
            <Image
              src="/images/ui/back.svg"
              alt=""
              width={10.4142}
              height={18}
            />
            <span className="sr-only">답변 종류 다시 선택</span>
          </IconButton>
          <fieldset disabled={mutation.isPending} className="space-y-7">
            <legend className="mb-7 text-2xl font-bold text-brand-ink">
              {kind === "DECLINE"
                ? "어떤 이유로 어려우신가요?"
                : kind === "CHANGE"
                  ? "조건을 바꿔 제안할까요?"
                  : "총무에게 보낼 답변을 써주세요"}
            </legend>
            {kind === "DECLINE" ? (
              <label className="block space-y-2">
                거절 사유 *
                <textarea
                  {...form.register("reason")}
                  className="min-h-24 w-full rounded-control border border-field bg-surface p-3"
                  maxLength={1000}
                />
                <FormError message={form.formState.errors.reason?.message} />
              </label>
            ) : (
              <>
                {kind === "CHANGE" && (
                  <section className="space-y-5 rounded-card bg-surface px-4 py-6 shadow-card">
                    <h2 className="text-xl font-semibold text-brand-ink">
                      변경할 조건
                    </h2>
                    <details className="text-sm">
                      <summary className="cursor-pointer font-semibold text-brand">
                        예약문의 보기
                      </summary>
                      <div className="pt-3">
                        <RequestSummary snapshot={q.snapshot} />
                      </div>
                    </details>
                    <Controller
                      name="proposal.startsAt"
                      control={form.control}
                      render={({ field }) => (
                        <div className="block space-y-2">
                          <label htmlFor="reply-starts-at">
                            제안 일시 (한국 시간) *
                          </label>
                          <DateTimePicker
                            id="reply-starts-at"
                            aria-label="제안 일시 (한국 시간)"
                            aria-describedby="reply-starts-at-error"
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            aria-invalid={
                              !!form.formState.errors.proposal?.startsAt
                            }
                            value={koreanDateInput(field.value)}
                            onChange={(value) =>
                              field.onChange(
                                fromKoreanDateInput(value) ?? value,
                              )
                            }
                          />
                        </div>
                      )}
                    />
                    <FormError
                      id="reply-starts-at-error"
                      message={
                        form.formState.errors.proposal?.startsAt?.message
                      }
                    />
                    <label className="block space-y-2">
                      제안 인원 *
                      <Input
                        type="number"
                        min={1}
                        {...form.register("proposal.expectedGuests", {
                          valueAsNumber: true,
                        })}
                      />
                    </label>
                    <FormError
                      message={
                        form.formState.errors.proposal?.expectedGuests &&
                        "제안 인원은 1~100,000명으로 입력해 주세요."
                      }
                    />
                    <label className="block space-y-2">
                      공간
                      <Select {...form.register("proposal.space")}>
                        {Object.entries(spaceLabel).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="block space-y-2">
                      착석
                      <Select {...form.register("proposal.seating")}>
                        {Object.entries(seatingLabel).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </section>
                )}
                {(q.defaults.bookingDescription ||
                  q.defaults.depositDescription) && (
                  <div className="rounded-control bg-surface p-3 text-sm text-muted">
                    현재 매장 안내:{" "}
                    {[
                      q.defaults.bookingDescription,
                      q.defaults.depositDescription,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                <label className="block space-y-2">
                  예약금
                  <Select
                    name="proposal.deposit.kind"
                    value={deposit}
                    onChange={(e) => {
                      const v = e.target.value as typeof deposit;

                      form.setValue("proposal.deposit", {
                        kind: v,
                        amount: v === "NONE" ? 0 : null,
                      });
                    }}
                  >
                    <option value="UNKNOWN">미확인</option>
                    <option value="NONE">없음 (0원)</option>
                    <option value="FIXED">확정 금액</option>
                    <option value="PER_RESERVATION">예약별 협의</option>
                  </Select>
                </label>
                {deposit === "FIXED" && (
                  <Controller
                    name="proposal.deposit.amount"
                    control={form.control}
                    render={({ field }) => (
                      <label className="block space-y-2">
                        예약금 (원)
                        <Input
                          type="number"
                          min={1}
                          name={field.name}
                          ref={field.ref}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                      </label>
                    )}
                  />
                )}
                <FormField
                  id="reply-usage-minutes"
                  label="이용 시간 (분)"
                  error={
                    form.formState.errors.proposal?.usageTime?.minutes?.message
                  }
                >
                  {(attrs) => (
                    <Input
                      {...attrs}
                      variant="pill"
                      type="number"
                      name="proposal.usageTime.minutes"
                      min={1}
                      max={1440}
                      placeholder="예) 120분"
                      value={offered?.usageTime?.minutes ?? ""}
                      disabled={usage === "UNLIMITED"}
                      onChange={(event) => {
                        const minutes =
                          event.target.value === ""
                            ? null
                            : Number(event.target.value);
                        form.setValue("proposal.usageTime", {
                          kind: minutes === null ? "UNKNOWN" : "MINUTES",
                          minutes,
                        });
                      }}
                    />
                  )}
                </FormField>
                <label className="flex items-center gap-2">
                  <span className="relative grid size-6 shrink-0 place-items-center">
                    <Checkbox
                      className="peer"
                      checked={usage === "UNLIMITED"}
                      onChange={(event) =>
                        form.setValue("proposal.usageTime", {
                          kind: event.target.checked ? "UNLIMITED" : "UNKNOWN",
                          minutes: null,
                        })
                      }
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
                {(
                  [
                    ["separateFee", "별도 대관료 (원)"],
                    ["minimumSpend", "최소 이용금액 (원)"],
                  ] as const
                ).map(([key, label]) => (
                  <Controller
                    key={key}
                    name={`proposal.${key}`}
                    control={form.control}
                    render={({ field }) => (
                      <FormField
                        id={`reply-${key}`}
                        label={label}
                        error={
                          form.formState.errors.proposal?.[key] &&
                          "0원 이상 20억 원 이하로 입력해 주세요."
                        }
                      >
                        {(attrs) => (
                          <Input
                            {...attrs}
                            variant="pill"
                            type="number"
                            name={field.name}
                            ref={field.ref}
                            min={0}
                            value={field.value ?? ""}
                            onChange={(event) =>
                              field.onChange(
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                              )
                            }
                            placeholder="미확인 시 비움, 없으면 0"
                          />
                        )}
                      </FormField>
                    )}
                  />
                ))}
                <Controller
                  name="proposal.minimumQuantity"
                  control={form.control}
                  render={({ field }) => (
                    <FormField
                      id="reply-minimum-quantity"
                      label="최소 주문 수량 (미확인 시 비움)"
                      error={
                        form.formState.errors.proposal?.minimumQuantity?.message
                      }
                    >
                      {(attrs) => (
                        <Input
                          {...attrs}
                          type="number"
                          min={0}
                          max={100000}
                          name={field.name}
                          ref={field.ref}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                      )}
                    </FormField>
                  )}
                />
                <label className="block space-y-2">
                  변경·취소·환불 조건 (미확인 시 비움)
                  <textarea
                    {...form.register("proposal.changeCancellationPolicy")}
                    className="min-h-24 w-full rounded-control border border-field bg-surface p-3"
                    maxLength={1500}
                  />
                </label>
                <Controller
                  name="expiresAt"
                  control={form.control}
                  render={({ field }) => (
                    <div className="block space-y-2">
                      <label htmlFor="reply-expires-at">
                        제안 선택 기한 (한국 시간) *
                      </label>
                      <DateTimePicker
                        id="reply-expires-at"
                        aria-label="제안 선택 기한 (한국 시간)"
                        aria-invalid={!!form.formState.errors.expiresAt}
                        aria-describedby="reply-expires-at-error"
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        value={koreanDateInput(field.value)}
                        onChange={(value) =>
                          field.onChange(
                            value
                              ? (fromKoreanDateInput(value) ?? value)
                              : null,
                          )
                        }
                      />
                      <FormError
                        id="reply-expires-at-error"
                        message={form.formState.errors.expiresAt?.message}
                      />
                    </div>
                  )}
                />
                <label className="block space-y-2">
                  사장님 한마디 (선택)
                  <textarea
                    {...form.register("proposal.note")}
                    className="min-h-24 w-full rounded-control border border-field bg-surface p-3"
                    maxLength={1500}
                  />
                </label>
                <p className="text-sm text-muted">
                  메뉴 확정 기한 ·{" "}
                  {menuDeadline === null
                    ? "미확인"
                    : koreanDateLabel(new Date(menuDeadline).toISOString())}
                </p>
                <FormError
                  message={
                    form.formState.errors.proposal?.note?.message ??
                    form.formState.errors.proposal?.deposit?.amount?.message
                  }
                />
                <label className="flex items-start gap-3 rounded-control bg-brand/10 p-3.5 text-sm shadow-control">
                  <span className="relative grid size-5 shrink-0 place-items-center">
                    <Checkbox
                      {...form.register("holdConfirmed")}
                      className="peer size-5 rounded-[6px] checked:shadow-none"
                    />
                    <Image
                      src="/images/merchant-replies/hold-check.svg"
                      alt=""
                      width={14}
                      height={14}
                      className="pointer-events-none absolute hidden peer-checked:block"
                    />
                  </span>
                  <span>
                    이 날짜·시간에{" "}
                    {offered?.expectedGuests ?? q.snapshot.expectedGuests}명
                    자리를 비워둘게요.
                    <span className="mt-1 block text-xs text-muted">
                      {deadline ? koreanDateLabel(deadline) : "선택 기한"}까지
                      좌석을 유지해 주세요.
                    </span>
                  </span>
                </label>
                <FormError
                  message={form.formState.errors.holdConfirmed?.message}
                />
              </>
            )}
          </fieldset>

          <p className="text-sm text-muted">
            답변을 보내면 수정할 수 없어요. 예약 조건을 확인해 주세요.
          </p>
          <FormError
            message={
              mutation.error ? safeErrorMessage(mutation.error) : undefined
            }
          />
          <Button type="submit" className="w-full" loading={mutation.isPending}>
            답변 보내기
          </Button>
        </form>
      )}
    </>
  );
}
