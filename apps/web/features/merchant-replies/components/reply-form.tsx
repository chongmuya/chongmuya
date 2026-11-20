"use client";
import { useRef, useState } from "react";
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
import { replySchema, type MerchantReplyInput } from "../schemas/reply.schema";
import type { MerchantInquiry } from "../types/reply.types";
import {
  RequestSummary,
  ReplySummary,
  spaceLabel,
  seatingLabel,
  money,
} from "./reply-summary";
import {
  fromKoreanDateInput,
  koreanDateInput,
  koreanDateLabel,
} from "@/shared/lib/korean-date";
function initial(q: MerchantInquiry): MerchantReplyInput {
  return {
    requestKey: crypto.randomUUID(),
    expectedVersion: q.version,
    kind: q.response?.kind ?? "AVAILABLE",
    proposal:
      q.response?.kind === "DECLINE"
        ? null
        : (q.response?.snapshot.offered ?? q.defaults.proposal),
    expiresAt: q.response ? q.response.expiresAt : q.defaults.expiresAt,
    reason: q.response?.reason ?? "",
    holdConfirmed: false,
  };
}
export function ReplyForm({
  inquiry: q,
  access,
  blocked,
  onAccessFailure,
}: {
  inquiry: MerchantInquiry;
  access: ReplyAccess;
  blocked: boolean;
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
  const [revising, setRevising] = useState(false);
  const offers = useRef<
    Partial<Record<"AVAILABLE" | "CHANGE", MerchantReplyInput["proposal"]>>
  >({});
  const previousDeadline = useRef(
    q.response?.expiresAt ?? q.defaults.expiresAt,
  );
  const last = useRef<{ fingerprint: string; key: string } | null>(null);
  const offered = useWatch({ control: form.control, name: "proposal" });
  const deposit = offered?.deposit.kind ?? "UNKNOWN";
  const deadline = useWatch({ control: form.control, name: "expiresAt" });
  const changed = q.version !== form.getValues("expectedVersion");
  function chooseKind(v: MerchantReplyInput["kind"]) {
    if (kind !== v) {
      if (kind !== "DECLINE") {
        offers.current[kind] = structuredClone(form.getValues("proposal"));
        previousDeadline.current = form.getValues("expiresAt");
      }
      form.setValue("kind", v);
      form.setValue(
        "proposal",
        v === "DECLINE"
          ? null
          : (offers.current[v] ?? structuredClone(q.defaults.proposal)),
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
      <h1 className="text-2xl font-bold">{q.restaurantName} 예약 문의</h1>
      {access.kind === "link" && (
        <p className="my-4 text-xs text-muted">
          답변·수정용 링크입니다. 외부에 공유하지 마세요.
        </p>
      )}
      <section className="rounded-control bg-surface p-5 shadow-card">
        <RequestSummary snapshot={q.snapshot} />
        <p className="mt-3 text-sm">
          현재 담당자: {q.organizerName} {q.organizerMaskedPhone}
        </p>
        {q.contactChangedAt && (
          <p className="text-caption text-muted">
            모임 인수인계로 담당자가 변경됐어요. 원래 문의·답변 기록은 보존돼요.
          </p>
        )}
      </section>
      {q.response && <ReplySummary response={q.response} />}
      {!editing && !revising && q.response && (
        <Button
          className="my-4 w-full"
          disabled={blocked}
          onClick={() => {
            form.reset(initial(q));
            offers.current = {};
            previousDeadline.current =
              q.response?.expiresAt ?? q.defaults.expiresAt;
            setRevising(true);
            setEditing(true);
          }}
        >
          답변 수정하기
        </Button>
      )}
      {!editing && (!q.response || revising) && (
        <section aria-label="답변 선택" className="mt-auto space-y-2 pt-8">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="brand-outline"
              disabled={blocked}
              onClick={() => chooseKind("CHANGE")}
            >
              조건 변경 제안
            </Button>
            <Button disabled={blocked} onClick={() => chooseKind("AVAILABLE")}>
              요청 조건으로 가능
            </Button>
          </div>
          <button
            type="button"
            className="block min-h-11 w-full text-sm font-medium text-secondary underline underline-offset-4"
            disabled={blocked}
            onClick={() => chooseKind("DECLINE")}
          >
            이 문의는 어려워요
          </button>
        </section>
      )}
      {editing && changed && (
        <div
          role="alert"
          className="my-4 rounded-control border border-brand p-4"
        >
          <p>
            다른 화면에서 답변이 변경됐어요. 최신 답변을 확인한 뒤 다시 작성해
            주세요.
          </p>
          <Button
            className="mt-3"
            onClick={() => {
              form.reset(initial(q));
              offers.current = {};
              previousDeadline.current =
                q.response?.expiresAt ?? q.defaults.expiresAt;
            }}
          >
            최신 답변으로 다시 작성
          </Button>
        </div>
      )}
      {editing && (
        <form
          noValidate
          className="mt-7 space-y-5"
          onSubmit={(event) =>
            void form.handleSubmit(async (input) => {
              if (sending.current || changed || blocked) return;
              if (input.kind !== "DECLINE") input = { ...input, reason: "" };
              sending.current = true;

              const fingerprint = JSON.stringify({
                ...input,
                requestKey: undefined,
              });
              if (last.current?.fingerprint !== fingerprint)
                last.current = { fingerprint, key: crypto.randomUUID() };
              try {
                const result = await mutation.mutateAsync({
                  ...input,
                  requestKey: last.current.key,
                });
                if (active.current) {
                  form.setValue("expectedVersion", result.version);
                  setEditing(false);
                  setRevising(false);
                }
              } catch {
                /* Preserve fields and request key for an explicit retry. */
              } finally {
                sending.current = false;
              }
            })(event)
          }
        >
          <fieldset
            disabled={mutation.isPending || changed || blocked}
            className="space-y-5"
          >
            <legend className="mb-4 text-xl font-bold">
              {kind === "DECLINE"
                ? "어떤 이유로 어려우신가요?"
                : kind === "CHANGE"
                  ? "어떤 조건을 바꿀까요?"
                  : "총무에게 보낼 답변을 써주세요"}
            </legend>
            <button
              type="button"
              className="text-sm text-link underline"
              onClick={() => setEditing(false)}
            >
              답변 종류 다시 선택
            </button>
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
                  <>
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
                  </>
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
                <details className="rounded-control border border-field p-4">
                  <summary className="cursor-pointer font-semibold">
                    금액·메뉴 조건 수정
                  </summary>
                  <div className="mt-5 space-y-5">
                    {(
                      [
                        ["minimumSpend", "최소 이용금액 (원)"],
                        ["separateFee", "별도 대관료 (원)"],
                      ] as const
                    ).map(([key, label]) => (
                      <Controller
                        key={key}
                        name={`proposal.${key}`}
                        control={form.control}
                        render={({ field }) => (
                          <label className="block space-y-2">
                            {label}
                            <Input
                              type="number"
                              name={field.name}
                              ref={field.ref}
                              min={0}
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                                )
                              }
                              placeholder="미확인 (없음은 0)"
                            />
                          </label>
                        )}
                      />
                    ))}
                    <Controller
                      name="proposal.menuDeadlineAt"
                      control={form.control}
                      render={({ field }) => (
                        <div className="block space-y-2">
                          <label htmlFor="reply-menu-deadline">
                            메뉴 확정 기한 (미확인 시 비워 두세요)
                          </label>
                          <DateTimePicker
                            id="reply-menu-deadline"
                            aria-label="메뉴 확정 기한"
                            aria-invalid={
                              !!form.formState.errors.proposal?.menuDeadlineAt
                            }
                            aria-describedby="reply-menu-deadline-error"
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
                            id="reply-menu-deadline-error"
                            message={
                              form.formState.errors.proposal?.menuDeadlineAt
                                ?.message
                            }
                          />
                        </div>
                      )}
                    />
                  </div>
                </details>
                <label className="block space-y-2">
                  이용 시간
                  <Select
                    name="proposal.usageTime.kind"
                    aria-label="이용 시간"
                    value={offered?.usageTime?.kind ?? "UNKNOWN"}
                    onChange={(e) =>
                      form.setValue("proposal.usageTime", {
                        kind: e.target.value as
                          "UNKNOWN" | "UNLIMITED" | "MINUTES",
                        minutes: e.target.value === "MINUTES" ? 120 : null,
                      })
                    }
                  >
                    <option value="UNKNOWN">미확인</option>
                    <option value="UNLIMITED">별도 시간 제한 없음</option>
                    <option value="MINUTES">이용 시간 지정</option>
                  </Select>
                </label>
                {offered?.usageTime?.kind === "MINUTES" && (
                  <FormField
                    id="reply-usage-minutes"
                    label="이용 시간 (분)"
                    error={
                      form.formState.errors.proposal?.usageTime?.minutes
                        ?.message
                    }
                  >
                    {(attrs) => (
                      <Input
                        {...attrs}
                        type="number"
                        min={1}
                        max={1440}
                        {...form.register("proposal.usageTime.minutes", {
                          valueAsNumber: true,
                        })}
                      />
                    )}
                  </FormField>
                )}
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
                {offered && (
                  <dl className="space-y-2 rounded-control bg-surface p-4 text-sm">
                    <div>
                      <dt>최소 이용금액 · 별도 대관료</dt>
                      <dd>
                        {money(offered.minimumSpend)} ·{" "}
                        {money(offered.separateFee)}
                      </dd>
                    </div>
                    <div>
                      <dt>예약금</dt>
                      <dd>
                        {offered.deposit.kind === "PER_RESERVATION"
                          ? "예약별 협의"
                          : money(offered.deposit.amount)}
                      </dd>
                    </div>
                    <div>
                      <dt>메뉴 확정 기한</dt>
                      <dd>
                        {offered.menuDeadlineAt
                          ? koreanDateLabel(offered.menuDeadlineAt)
                          : "미확인"}
                      </dd>
                    </div>
                  </dl>
                )}
                <FormError
                  message={
                    (form.formState.errors.proposal?.minimumSpend ||
                    form.formState.errors.proposal?.separateFee
                      ? "최소 이용금액과 별도 대관료는 0원 이상 20억 원 이하로 입력해 주세요."
                      : undefined) ??
                    form.formState.errors.proposal?.note?.message ??
                    form.formState.errors.proposal?.deposit?.amount?.message ??
                    form.formState.errors.proposal?.menuDeadlineAt?.message
                  }
                />
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox {...form.register("holdConfirmed")} />
                  <span>
                    이 날짜·시간에 해당 인원의 좌석을 준비하며{" "}
                    {deadline ? koreanDateLabel(deadline) : "선택 기한"}
                    까지 좌석을 유지할 수 있어요.
                  </span>
                </label>
                <FormError
                  message={form.formState.errors.holdConfirmed?.message}
                />
              </>
            )}
          </fieldset>

          <FormError
            message={
              mutation.error ? safeErrorMessage(mutation.error) : undefined
            }
          />
          <Button
            type="submit"
            className="w-full"
            disabled={changed || blocked}
            loading={mutation.isPending}
          >
            답변 저장
          </Button>
        </form>
      )}
    </>
  );
}
