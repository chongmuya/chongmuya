"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import {
  replyQuery,
  isMerchantAccessError,
  type ReplyAccess,
} from "../api/replies.api";
import { useReplyAction } from "../hooks/use-reply-action";
import { replySchema, type MerchantReplyInput } from "../schemas/reply.schema";
import type { MerchantInquiry } from "../types/reply.types";
import {
  RequestSummary,
  ReplySummary,
  spaceLabel,
  seatingLabel,
} from "./reply-summary";
const localDate = (value: string | null | undefined) =>
  value
    ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    : "";
const isoDate = (value: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
function initial(q: MerchantInquiry): MerchantReplyInput {
  return {
    requestKey: crypto.randomUUID(),
    expectedVersion: q.version,
    kind: q.response?.kind ?? "AVAILABLE",
    proposal:
      q.response?.kind === "DECLINE"
        ? null
        : (q.response?.snapshot.offered ?? q.defaults.proposal),
    expiresAt: q.response?.expiresAt ?? q.defaults.expiresAt,
    reason: q.response?.reason ?? "",
    holdConfirmed: false,
  };
}
export function ReplyWorkspace({
  targetId,
  access,
}: {
  targetId: string;
  access: ReplyAccess;
}) {
  const expiresAt =
    access.kind === "link" ? Date.parse(access.accessExpiresAt) : Infinity;
  const [denied, setDenied] = useState(false),
    [expired, setExpired] = useState(() => expiresAt <= Date.now());
  useEffect(() => {
    if (!Number.isFinite(expiresAt)) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const q = useQuery({
    ...replyQuery(targetId, access),
    enabled: (query) =>
      !denied && !expired && !isMerchantAccessError(query.state.error),
  });
  const blocked = denied || expired || isMerchantAccessError(q.error);
  const notice = isMerchantAccessError(q.error)
    ? safeErrorMessage(q.error)
    : "접근 권한이 만료됐습니다. 문자에 있는 원래 링크를 다시 열어 주세요.";
  if (blocked && !q.data) return <p role="alert">{notice}</p>;
  if (q.isError && !q.data)
    return (
      <ErrorState retry={() => void q.refetch()}>
        {safeErrorMessage(q.error)}
      </ErrorState>
    );
  if (!q.data) return <LoadingState>예약 문의 확인 중…</LoadingState>;
  return (
    <>
      {blocked && (
        <p role="alert" className="mb-4">
          {notice} 현재 탭의 입력은 유지되지만, 새 탭으로 자동 복원되지는
          않습니다.
        </p>
      )}
      {q.isError && !blocked && (
        <div
          role="alert"
          className="mb-4 rounded-control border border-field p-4"
        >
          <p>최신 문의를 불러오지 못했어요. 작성 중인 답변은 유지됩니다.</p>
          <p className="mt-2 text-sm">{safeErrorMessage(q.error)}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void q.refetch()}
          >
            다시 확인
          </Button>
        </div>
      )}
      <ReplyForm
        inquiry={q.data}
        access={access}
        blocked={blocked}
        onAccessFailure={() => setDenied(true)}
      />
    </>
  );
}
function ReplyForm({
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
    resolver: zodResolver(replySchema),
    defaultValues: initial(q),
  });
  const mutation = useReplyAction(q.targetId, access, onAccessFailure),
    active = useActiveScreen(),
    sending = useRef(false);
  const [kind, setKind] = useState(q.response?.kind ?? "AVAILABLE"),
    [saved, setSaved] = useState(false),
    [deposit, setDeposit] = useState(
      q.response?.snapshot.offered?.deposit.kind ??
        q.defaults.proposal.deposit.kind,
    );
  const last = useRef<{ fingerprint: string; key: string } | null>(null);
  const changed = q.version !== form.getValues("expectedVersion");
  return (
    <>
      <h1 className="text-2xl font-bold">{q.restaurantName} 예약 문의</h1>
      <p className="my-4 text-sm text-muted">
        이 링크는 해당 예약 문의의 답변·수정용입니다. 외부에 공유하지 마세요.
      </p>
      <section className="rounded-control bg-surface p-5 shadow-card">
        <RequestSummary snapshot={q.snapshot} />
        <p className="mt-3 text-sm">담당자: {q.organizerName}</p>
      </section>
      {q.response && <ReplySummary response={q.response} />}
      {changed && (
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
              setKind(q.response?.kind ?? "AVAILABLE");
              setDeposit(
                q.response?.snapshot.offered?.deposit.kind ??
                  q.defaults.proposal.deposit.kind,
              );
            }}
          >
            최신 답변으로 다시 작성
          </Button>
        </div>
      )}
      <form
        className="mt-7 space-y-5"
        onSubmit={(event) =>
          void form.handleSubmit(async (input) => {
            if (sending.current || changed || blocked) return;
            sending.current = true;
            setSaved(false);
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
                setSaved(true);
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
          <legend className="mb-4 text-xl font-bold">문의에 답변하기</legend>
          <label className="block space-y-2">
            답변
            <Select
              value={kind}
              onChange={(e) => {
                const v = e.target.value as MerchantReplyInput["kind"];
                setKind(v);
                form.setValue("kind", v);
                form.setValue(
                  "proposal",
                  v === "DECLINE" ? null : q.defaults.proposal,
                );
                form.setValue(
                  "expiresAt",
                  v === "DECLINE" ? null : q.defaults.expiresAt,
                );
                form.setValue("holdConfirmed", false);
                setDeposit(q.defaults.proposal.deposit.kind);
                setSaved(false);
              }}
            >
              <option value="AVAILABLE">요청 조건으로 가능</option>
              <option value="CHANGE">조건 변경 제안</option>
              <option value="DECLINE">불가</option>
            </Select>
          </label>
          {kind === "DECLINE" ? (
            <label className="block space-y-2">
              거절 사유 *
              <textarea
                {...form.register("reason")}
                className="min-h-24 w-full rounded-control border border-field bg-surface p-3"
                maxLength={1000}
              />
            </label>
          ) : (
            <>
              {kind === "CHANGE" && (
                <>
                  <Controller
                    name="proposal.startsAt"
                    control={form.control}
                    render={({ field }) => (
                      <label className="block space-y-2">
                        제안 일시 *
                        <Input
                          type="datetime-local"
                          value={localDate(field.value)}
                          onChange={(e) =>
                            field.onChange(isoDate(e.target.value) ?? "")
                          }
                        />
                      </label>
                    )}
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
              {kind === "AVAILABLE" && (
                <p className="text-sm">
                  요청한 일시·인원·공간·착석 조건으로 답변합니다. 변경이
                  필요하면 ‘조건 변경 제안’을 선택해 주세요.
                </p>
              )}
              <div className="rounded-control bg-surface p-3 text-sm text-muted">
                현재 매장 안내:{" "}
                {q.defaults.bookingDescription ?? "기본 조건 확인 필요"}
                <br />
                {q.defaults.depositDescription ?? "예약금 확인 필요"}
              </div>
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
              <label className="block space-y-2">
                예약금
                <Select
                  value={deposit}
                  onChange={(e) => {
                    const v = e.target.value as typeof deposit;
                    setDeposit(v);
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
              <Controller
                name="proposal.menuDeadlineAt"
                control={form.control}
                render={({ field }) => (
                  <label className="block space-y-2">
                    메뉴 확정 기한 (미확인 시 비워 두세요)
                    <Input
                      type="datetime-local"
                      value={localDate(field.value)}
                      onChange={(e) => field.onChange(isoDate(e.target.value))}
                    />
                  </label>
                )}
              />
              <Controller
                name="expiresAt"
                control={form.control}
                render={({ field }) => (
                  <label className="block space-y-2">
                    제안 선택 기한 *
                    <Input
                      type="datetime-local"
                      value={localDate(field.value)}
                      onChange={(e) => field.onChange(isoDate(e.target.value))}
                    />
                    <span className="block text-xs text-muted">
                      미래 시각이며 행사 시작·메뉴 확정 이전이어야 해요. 기본
                      12시간을 적용할 수 없으면 직접 입력해 주세요.
                    </span>
                  </label>
                )}
              />
              <label className="block space-y-2">
                {kind === "CHANGE" ? "변경 조건 설명 *" : "추가 안내"}
                <textarea
                  {...form.register("proposal.note")}
                  className="min-h-24 w-full rounded-control border border-field bg-surface p-3"
                  maxLength={1500}
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox {...form.register("holdConfirmed")} />
                <span>
                  이 일시·인원·공간으로 받을 수 있으며 선택 기한까지 좌석을
                  유지할 수 있음을 확인합니다.
                </span>
              </label>
            </>
          )}
        </fieldset>
        {Object.keys(form.formState.errors).length > 0 && (
          <FormError message="필수 답변과 일시·인원·금액을 확인해 주세요." />
        )}
        <FormError
          message={
            mutation.error ? safeErrorMessage(mutation.error) : undefined
          }
        />
        {saved && (
          <p role="status" className="text-sm text-brand">
            답변을 저장했어요. 예약 확정은 아직 진행되지 않았어요.
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={changed || blocked}
          loading={mutation.isPending}
        >
          답변 저장
        </Button>
      </form>
    </>
  );
}
