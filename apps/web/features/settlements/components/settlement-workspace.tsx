"use client";
import { useId, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { cn } from "@/shared/lib/cn";
import { Input } from "@/shared/ui/input";
import { FormInput } from "@/shared/ui/form-input";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { ApiError } from "@/shared/http/api-error";
import { EventFiles } from "@/features/files/client";
import { settlementQuery } from "../api/settlement.api";
import { useSettlementCommand } from "../hooks/use-settlement-command";
import type {
  Access,
  Detail,
  Expense,
  Notice,
} from "../types/settlement.types";
import { ExpenseForm } from "./expense-form";
import { NoticePanel } from "./notice-panel";
import { CommandStatus } from "./command-status";
import { DeadlineReminder } from "./deadline-reminder";
import { EventFinalization } from "./event-finalization";
import { confirmationDeadline } from "../lib/confirmation-deadline";
const validReturnTime = (value: string) =>
  !!value &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) <= Date.now();
const reasonSchema = z.object({
  amount: z.string(),
  returnedAt: z.string(),
  reason: z
    .string()
    .trim()
    .min(1, "사유를 입력해 주세요.")
    .max(300, "300자 이내로 입력해 주세요."),
});
function MoneyAction({
  a,
  data,
  target,
  onClose,
}: {
  a: Access;
  data: Detail;
  target: {
    participantId: string;
    kind: "RETURN" | "CORRECTION";
    paymentId?: string;
  };
  onClose: () => void;
}) {
  const [base, setBase] = useState(data.state.version),
    c = useSettlementCommand(a),
    row = data.summary.people.find((p) => p.person.id === target.participantId),
    form = useForm<z.infer<typeof reasonSchema>>({
      resolver: zodResolver(reasonSchema),
      defaultValues: {
        amount: row?.excess ? String(row.excess) : "",
        reason: "",
        returnedAt: "",
      },
    });
  return (
    <form
      className="space-y-3 rounded-lg border border-field p-4"
      onSubmit={form.handleSubmit(async (v) => {
        const amount = Number(v.amount);
        if (target.kind === "RETURN") {
          const maximum = Math.min(row?.net ?? 0, 2_000_000_000);
          if (!/^\d+$/.test(v.amount) || amount < 1 || amount > maximum) {
            form.setError(
              "amount",
              {
                message:
                  maximum > 0
                    ? `1원부터 ${maximum.toLocaleString()}원까지 입력해 주세요.`
                    : "현재 순확인액이 없어 반환을 기록할 수 없습니다.",
              },
              { shouldFocus: true },
            );
            return;
          }
          if (!validReturnTime(v.returnedAt)) {
            form.setError(
              "returnedAt",
              { message: "실제 반환한 시각을 현재 이전으로 입력해 주세요." },
              { shouldFocus: true },
            );
            return;
          }
        }
        try {
          await c.mutateAsync({
            action: target.kind,
            expectedVersion: base,
            ...(target.kind === "RETURN"
              ? {
                  participantId: target.participantId,
                  amount,
                  returnedAt: new Date(v.returnedAt).toISOString(),
                }
              : { paymentId: target.paymentId }),
            reason: v.reason,
          });
          if (c.active.current) onClose();
        } catch {}
      })}
    >
      <h3>
        {target.kind === "RETURN"
          ? "실제 반환 사실 기록 (송금 아님)"
          : "잘못 기록한 체크 정정 (반환 아님)"}
      </h3>
      <p>
        {row?.person.name} · 현재 순확인 {row?.net.toLocaleString()}원
      </p>
      <fieldset disabled={c.uncertain || c.isPending} className="space-y-3">
        {target.kind === "RETURN" && (
          <label>
            실제 반환한 금액
            <Input
              {...form.register("amount")}
              inputMode="numeric"
              aria-invalid={!!form.formState.errors.amount}
              aria-describedby="return-amount-error"
            />
            <span id="return-amount-error" className="text-danger">
              {form.formState.errors.amount?.message}
            </span>
          </label>
        )}
        {target.kind === "RETURN" && (
          <div>
            <label htmlFor="return-time">실제 반환 시각</label>
            <FormInput
              id="return-time"
              type="datetime-local"
              control={form.control}
              name="returnedAt"
              aria-label="실제 반환 시각"
              aria-invalid={!!form.formState.errors.returnedAt}
              aria-describedby="return-time-error"
            />
            <span id="return-time-error" className="text-danger">
              {form.formState.errors.returnedAt?.message}
            </span>
          </div>
        )}
        <label>
          사유
          <Input
            {...form.register("reason")}
            aria-invalid={!!form.formState.errors.reason}
            aria-describedby="return-reason-error"
          />
          <span id="return-reason-error" className="text-danger">
            {form.formState.errors.reason?.message}
          </span>
        </label>
      </fieldset>
      {base !== data.state.version && !c.uncertain && (
        <Button variant="outline" onClick={() => setBase(data.state.version)}>
          최신 순확인액 확인 · 재적용 준비
        </Button>
      )}
      <CommandStatus command={c} />
      <Button
        type="submit"
        disabled={c.uncertain || c.isPending || base !== data.state.version}
      >
        사실 기록
      </Button>
      <Button
        variant="outline"
        disabled={c.uncertain || c.isPending}
        onClick={onClose}
      >
        취소
      </Button>
    </form>
  );
}
function People({ a, data }: { a: Access; data: Detail }) {
  const breakdownId = useId();
  const [breakdown, setBreakdown] = useState<{
    participantId: string;
    roundId: string;
  } | null>(null);
  const [target, setTarget] = useState<{
      participantId: string;
      kind: "RETURN" | "CORRECTION";
      paymentId?: string;
    } | null>(null),
    [confirm, setConfirm] = useState<{
      id: string;
      amount: number;
      version: number;
      calculationVersion: number;
    } | null>(null);
  const c = useSettlementCommand(a, () => setConfirm(null));
  const breakdownPerson = data.summary.people.find(
    (p) => p.person.id === breakdown?.participantId,
  );
  const breakdownRound = data.facts.rounds.find(
    (round) => round.id === breakdown?.roundId,
  );
  if (target)
    return (
      <MoneyAction
        key={target.paymentId ?? target.participantId}
        a={a}
        data={data}
        target={target}
        onClose={() => setTarget(null)}
      />
    );
  return (
    <div className="space-y-4 px-5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm leading-tight">
          <caption className="sr-only">개인별 정산과 차수별 부담액</caption>
          <thead className="text-placeholder">
            <tr className="h-[25px] text-left">
              <th scope="col" className="pr-2 text-center">
                이름
              </th>
              {data.facts.rounds.map((round) => (
                <th
                  scope="col"
                  key={round.id}
                  className="px-0.5 text-center whitespace-nowrap"
                >
                  {round.title}
                </th>
              ))}
              <th
                scope="col"
                className="min-w-20 pl-2 text-right whitespace-nowrap"
              >
                총 정산금
              </th>
              <th scope="col" className="pl-3 text-center whitespace-nowrap">
                입금
              </th>
            </tr>
          </thead>
          <tbody>
            {data.summary.people.map((p) => (
              <tr key={p.person.id} className="h-[67px]">
                <th
                  scope="row"
                  className="min-w-12 pr-2 text-left font-semibold wrap-anywhere"
                >
                  {p.person.name}
                  {(p.person.label || p.person.phoneLast4) && (
                    <small className="mt-1 block text-xs font-normal">
                      {p.person.label} {p.person.phoneLast4}
                    </small>
                  )}
                </th>
                {data.facts.rounds.map((round) => {
                  const amount = p.rounds[round.id] ?? 0;
                  return (
                    <td key={round.id} className="px-0.5">
                      <button
                        type="button"
                        className="mx-auto flex size-7 cursor-pointer items-center justify-center rounded-[9px] bg-soft"
                        title={`${round.title} ${amount.toLocaleString()}원`}
                        aria-haspopup="dialog"
                        aria-label={`${p.person.name} ${round.title} 부담액 ${amount.toLocaleString()}원`}
                        onClick={() =>
                          setBreakdown({
                            participantId: p.person.id,
                            roundId: round.id,
                          })
                        }
                      >
                        {amount > 0 && (
                          <Image
                            src="/images/settlements/round-participation.svg"
                            alt=""
                            width={28}
                            height={28}
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
                <td className="pl-2 text-right text-base font-medium whitespace-nowrap">
                  {p.amount.toLocaleString()}원
                  {p.net > 0 && p.remaining > 0 && (
                    <small className="block text-xs text-secondary">
                      미확인 {p.remaining.toLocaleString()}원
                    </small>
                  )}
                  {p.excess > 0 && (
                    <small className="block text-xs text-danger">
                      초과 {p.excess.toLocaleString()}원
                    </small>
                  )}
                </td>
                <td className="pl-3 text-center">
                  {p.remaining > 0 ? (
                    <IconButton
                      aria-label={`${p.person.name} 입금 확인`}
                      title="입금 확인"
                      className="size-7 rounded-full border border-placeholder"
                      disabled={c.isPending || c.uncertain}
                      onClick={() =>
                        setConfirm({
                          id: p.person.id,
                          amount: p.remaining,
                          version: data.state.version,
                          calculationVersion: data.state.calculationVersion,
                        })
                      }
                    />
                  ) : p.amount > 0 && !p.excess ? (
                    <Image
                      className="mx-auto"
                      src="/images/settlements/check-on.svg"
                      alt="입금 확인됨"
                      width={28}
                      height={28}
                    />
                  ) : (
                    <span
                      className="text-xs text-secondary"
                      aria-label={p.excess ? "초과 확인" : "입금 불필요"}
                    >
                      –
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {breakdownPerson && breakdownRound && (
        <Dialog
          labelledBy={breakdownId}
          className="space-y-4"
          onClose={() => setBreakdown(null)}
        >
          <h3 id={breakdownId} className="text-lg font-semibold">
            {breakdownPerson.person.name} · {breakdownRound.title} 부담액
          </h3>
          <p>
            {(breakdownPerson.rounds[breakdownRound.id] ?? 0).toLocaleString()}
            원
          </p>
          <Button className="w-full" onClick={() => setBreakdown(null)}>
            확인
          </Button>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          labelledBy="settlement-receipt-title"
          busy={c.uncertain || c.isPending}
          className="space-y-3"
          onClose={() => setConfirm(null)}
        >
          <h3 id="settlement-receipt-title" className="text-lg font-semibold">
            입금 확인 기록
          </h3>
          <p>
            {confirm.amount.toLocaleString()}원을 실제로 받은 사실을 기록합니다.
            계산 버전 {confirm.calculationVersion}
          </p>
          <Button
            disabled={
              c.isPending ||
              c.uncertain ||
              confirm.version !== data.state.version
            }
            onClick={() =>
              c.mutate({
                action: "RECEIPT",
                expectedVersion: confirm.version,
                calculationVersion: confirm.calculationVersion,
                participantId: confirm.id,
                amount: confirm.amount,
              })
            }
          >
            확인 기록
          </Button>
          <Button
            variant="outline"
            disabled={c.uncertain || c.isPending}
            onClick={() => setConfirm(null)}
          >
            취소
          </Button>
          {confirm.version !== data.state.version && !c.uncertain && (
            <p>정산이 변경됐습니다. 취소 후 최신 금액을 다시 확인해 주세요.</p>
          )}
          <CommandStatus command={c} />
        </Dialog>
      )}
      {(data.state.payments.length > 0 ||
        data.summary.people.some((p) => p.net > 0)) && (
        <details className="space-y-3 text-sm">
          <summary className="cursor-pointer text-secondary">
            입금·반환·정정 이력
          </summary>
          {data.summary.people
            .filter((p) => p.net > 0)
            .map((p) => (
              <div
                key={p.person.id}
                className="flex items-center justify-between gap-3"
              >
                <span>
                  {p.person.name} · 순확인 {p.net.toLocaleString()}원
                </span>
                <Button
                  variant="outline"
                  disabled={c.uncertain || c.isPending}
                  onClick={() =>
                    setTarget({ participantId: p.person.id, kind: "RETURN" })
                  }
                >
                  실제 반환 기록
                </Button>
              </div>
            ))}
          {data.state.payments.map((p) => (
            <div key={p.id} className="my-3 rounded border border-field p-3">
              <p>
                {p.participant.name} ·{" "}
                {
                  {
                    RECEIPT: "입금 확인",
                    RETURN: "실제 반환",
                    CORRECTION: "체크 정정",
                  }[p.kind]
                }{" "}
                {p.amount.toLocaleString()}원
              </p>
              <small>
                기록 시각 {new Date(p.at).toLocaleString("ko-KR")} · 계산{" "}
                {p.calculationVersion} · 기록자 {p.actorId}
              </small>
              <p>{p.reason}</p>
              {p.kind === "RETURN" && (
                <p>
                  실제 반환 시각:{" "}
                  {p.returnedAt
                    ? new Date(p.returnedAt).toLocaleString("ko-KR")
                    : "미기록 (과거 기록)"}
                </p>
              )}
              {p.kind !== "CORRECTION" &&
                !data.state.payments.some((x) => x.corrects === p.id) && (
                  <Button
                    variant="outline"
                    disabled={c.uncertain || c.isPending}
                    onClick={() =>
                      setTarget({
                        participantId: p.participant.id,
                        kind: "CORRECTION",
                        paymentId: p.id,
                      })
                    }
                  >
                    잘못 기록한 체크 정정
                  </Button>
                )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
const memoSchema = z.object({
  memo: z.string().max(100, "100자 이내로 입력해 주세요."),
});
function Memo({ a, data }: { a: Access; data: Detail }) {
  const [base, setBase] = useState(data.state.version),
    c = useSettlementCommand(a),
    f = useForm<z.infer<typeof memoSchema>>({
      resolver: zodResolver(memoSchema),
      defaultValues: { memo: data.state.memo },
    });
  return (
    <form
      className="my-5 space-y-3"
      onSubmit={f.handleSubmit((v) => {
        void c
          .mutateAsync({ action: "MEMO", expectedVersion: base, memo: v.memo })
          .then((d) => {
            if (c.active.current) setBase(d.state.version);
          })
          .catch(() => {});
      })}
    >
      <label className="block">
        메모 (100자)
        <textarea
          className="mt-2 min-h-24 w-full rounded-[20px] border border-field bg-surface p-4"
          {...f.register("memo")}
          disabled={c.uncertain || c.isPending}
          aria-invalid={!!f.formState.errors.memo}
          aria-describedby="memo-error"
        />
        <span id="memo-error" className="text-danger">
          {f.formState.errors.memo?.message}
        </span>
      </label>
      {base !== data.state.version && !c.uncertain && (
        <div>
          <p>최신 메모: {data.state.memo || "없음"}</p>
          <Button variant="outline" onClick={() => setBase(data.state.version)}>
            최신 메모 확인 · 입력 재적용 준비
          </Button>
        </div>
      )}
      <Button
        type="submit"
        disabled={base !== data.state.version || c.uncertain || c.isPending}
      >
        메모 저장
      </Button>
      <CommandStatus command={c} />
    </form>
  );
}
export function SettlementWorkspace({
  accountId,
  eventId,
  request,
  record = false,
  startExpense = false,
}: Access & { record?: boolean; startExpense?: boolean }) {
  const a = { accountId, eventId, request },
    q = useQuery(settlementQuery(a));
  if (q.error instanceof ApiError && [401, 403, 404].includes(q.error.status))
    return <p role="alert">행사 정산에 접근할 수 없습니다.</p>;
  if (!q.data)
    return (
      <div>
        {q.error ? (
          <>
            <p role="alert">{safeErrorMessage(q.error)}</p>
            <Button onClick={() => void q.refetch()}>다시 조회</Button>
          </>
        ) : (
          <p role="status">정산을 불러오는 중입니다.</p>
        )}
      </div>
    );
  return (
    <>
      {q.error && (
        <p role="alert">
          최신 조회에 실패했습니다. 입력은 보존됩니다.{" "}
          {safeErrorMessage(q.error)}
        </p>
      )}
      {q.data.depositConflicts?.length ? (
        <p role="alert">
          <strong>정산 재확인 필요</strong> · 지출에 적용한 예약금이 실제
          잔액보다 큽니다. 연결 지출을 수정한 뒤 새 정산문을 만들어 주세요.
        </p>
      ) : null}
      <Loaded
        access={a}
        data={q.data}
        record={record}
        startExpense={startExpense}
      />
    </>
  );
}
const settlementTabs = [
  ["expenses", "지출 확인"],
  ["people", "개인별 정산"],
  ["notices", "정산문 쓰기"],
] as const;

function Loaded({
  access: a,
  data,
  record,
  startExpense,
}: {
  access: Access;
  data: Detail;
  record: boolean;
  startExpense: boolean;
}) {
  const tabsId = useId();
  const deadline = confirmationDeadline(data);
  // Decide once on entry. Closing the reminder or background refreshes must not
  // interrupt an existing form; the current unconfirmed count can reopen it.
  const [deadlineOpen, setDeadlineOpen] = useState(() => !record && !!deadline);
  const [noticeFlow, setNoticeFlow] = useState(false);
  const [createNoticeScope, setCreateNoticeScope] = useState<
    Notice["scope"] | null
  >(null);
  const [tab, setTab] =
      useState<(typeof settlementTabs)[number][0]>("expenses"),
    [editing, setEditing] = useState<Expense | "new" | null>(() =>
      startExpense && !record && data.summary.status === "EMPTY" ? "new" : null,
    ),
    [deleting, setDeleting] = useState<{ id: string; version: number } | null>(
      null,
    ),
    c = useSettlementCommand(a, () => {
      setDeleting(null);
      setEditing(null);
    }),
    s = data.summary;
  const expenses = data.state.expenses.filter((expense) => !expense.deletedAt);
  const empty = s.status === "EMPTY" && expenses.length === 0;
  const newExpense = () => setEditing("new");
  const registerExpense = (
    <div className="flex justify-end pr-2">
      <Button
        variant="outline"
        className="min-h-[43px] gap-2 rounded-control border-placeholder px-3 text-sm font-medium text-copy"
        onClick={newExpense}
      >
        <Image
          src="/images/settlements/add.svg"
          alt=""
          width={13}
          height={13}
        />
        지출 등록
      </Button>
    </div>
  );
  return (
    <div
      className="space-y-7"
      data-settlement-subtab={!empty && tab !== "expenses" ? tab : undefined}
    >
      <DeadlineReminder
        data={data}
        open={deadlineOpen && !noticeFlow && !editing}
        onClose={() => setDeadlineOpen(false)}
        onViewPeople={() => setTab("people")}
        onCreateNotice={() => {
          setTab("notices");
          setCreateNoticeScope("UNCONFIRMED");
          setNoticeFlow(true);
        }}
      />
      {record && (
        <section>
          <h2 className="text-xl font-bold">행사 기록</h2>
          <p>선택 매장: {data.reservations[0]?.restaurantName ?? "없음"}</p>
          <p>한 차수 이상 최종 참석 {data.facts.attendingCount}명</p>
          <Memo a={a} data={data} />
        </section>
      )}
      {empty ? (
        <section className="px-7 pt-[42px] pb-5 text-center">
          <Image
            src="/images/settlements/receipt-empty.svg"
            alt=""
            width={29}
            height={42}
            className="mx-auto"
          />
          <h2 className="mt-[17px] text-label">등록된 지출이 없어요</h2>
          <p className="mt-2 text-xs leading-tight text-secondary">
            지출을 등록하면 참석자끼리 자동으로 나눠 정산해요.
          </p>
          <Button className="mt-5 w-full" onClick={newExpense}>
            지출 등록하기
          </Button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(90px,111px)_1fr] gap-[15px] leading-none">
            <div className="flex min-h-[97px] flex-col justify-between rounded-control bg-surface px-4 pt-6 pb-[18px] shadow-control">
              <p className="text-xs text-secondary">확인할 인원</p>
              <div className="flex items-end justify-end gap-0.5">
                {deadline ? (
                  <button
                    type="button"
                    aria-label={`미확인 ${s.unconfirmed}명`}
                    aria-haspopup="dialog"
                    className="cursor-pointer text-2xl leading-none font-bold text-brand-ink underline-offset-4 hover:underline"
                    onClick={() => setDeadlineOpen(true)}
                  >
                    {s.unconfirmed}
                  </button>
                ) : (
                  <strong className="text-2xl leading-none text-brand-ink">
                    {s.unconfirmed}
                  </strong>
                )}
                <small className="text-xs text-placeholder">
                  /{s.people.filter((p) => p.amount > 0).length}명
                </small>
              </div>
            </div>
            <dl className="flex min-h-[97px] min-w-0 flex-col justify-between gap-2 rounded-control bg-surface px-4 py-[18px] shadow-control">
              {(
                [
                  ["전체 지출", s.total],
                  ["입금 확인", s.received],
                ] as const
              ).map(([label, amount]) => (
                <div
                  key={label}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-x-2"
                >
                  <dt className="text-xs text-secondary">{label}</dt>
                  <dd className="ml-auto flex items-end gap-0.5">
                    <span className="text-xl leading-tight font-semibold text-brand-ink">
                      {amount.toLocaleString()}{" "}
                    </span>
                    <small className="mb-0.5 text-xs text-placeholder">
                      원
                    </small>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <section className="rounded-control bg-surface py-6 shadow-card">
            <div
              className="mx-[22px] mb-9 flex min-h-[43px] justify-between gap-1 rounded-pill border border-brand p-0.5"
              role="tablist"
              aria-label="정산 내용"
            >
              {settlementTabs.map(([id, label], index) => (
                <button
                  key={id}
                  id={`${tabsId}-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  aria-controls={`${tabsId}-panel-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  className={cn(
                    "min-w-0 cursor-pointer rounded-pill px-[clamp(6px,4vw,16px)] text-sm font-semibold",
                    tab === id
                      ? "bg-brand text-white shadow-control"
                      : "text-secondary",
                  )}
                  onClick={() => setTab(id)}
                  onKeyDown={(event) => {
                    const count = settlementTabs.length;
                    const next =
                      event.key === "ArrowRight"
                        ? (index + 1) % count
                        : event.key === "ArrowLeft"
                          ? (index + count - 1) % count
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? count - 1
                              : null;
                    if (next === null) return;
                    event.preventDefault();
                    const nextId = settlementTabs[next]![0];
                    setTab(nextId);
                    document.getElementById(`${tabsId}-tab-${nextId}`)?.focus();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`${tabsId}-panel-expenses`}
              aria-labelledby={`${tabsId}-tab-expenses`}
              hidden={tab !== "expenses"}
            >
              {registerExpense}
              <ul className="px-5">
                {expenses.map((expense) => (
                  <li
                    key={expense.id}
                    className="flex min-h-[74px] items-center gap-3"
                  >
                    <span className="flex min-h-[42px] min-w-[42px] max-w-20 shrink-0 items-center justify-center rounded-control bg-brand px-1.5 text-center text-control leading-none font-medium text-white wrap-anywhere">
                      {data.facts.rounds.find(
                        (round) => round.id === expense.roundId,
                      )?.title ?? "차수"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium wrap-anywhere">
                        {expense.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs leading-tight text-placeholder">
                        <Image
                          src="/images/settlements/people.svg"
                          alt=""
                          width={17}
                          height={15}
                        />
                        <span>{expense.payers.length}명</span>
                        {expense.deposit > 0 && expense.includeDeposit && (
                          <span className="border-l border-field pl-2">
                            예약금 포함
                          </span>
                        )}
                        {!expense.payers.length && (
                          <span className="text-brand">부담자 미지정</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-right font-medium">
                      {expense.total.toLocaleString()}원
                    </span>
                    <IconButton
                      aria-label={`${expense.name} 지출 수정`}
                      title="지출 수정"
                      className="-ml-2 size-7"
                      disabled={c.uncertain || c.isPending}
                      onClick={() => setEditing(expense)}
                    >
                      <Image
                        src="/images/settlements/edit.svg"
                        alt=""
                        width={17}
                        height={17}
                      />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>
            <div
              role="tabpanel"
              id={`${tabsId}-panel-people`}
              aria-labelledby={`${tabsId}-tab-people`}
              hidden={tab !== "people"}
            >
              <div className="mb-2">{registerExpense}</div>
              <People a={a} data={data} />
            </div>
            <div
              role="tabpanel"
              id={`${tabsId}-panel-notices`}
              aria-labelledby={`${tabsId}-tab-notices`}
              hidden={tab !== "notices"}
            >
              <NoticePanel
                access={a}
                data={data}
                active={tab === "notices"}
                onFlowChange={setNoticeFlow}
                createScope={createNoticeScope}
                onCreateScopeHandled={() => setCreateNoticeScope(null)}
              />
            </div>
          </section>
        </>
      )}
      {editing && (
        <ExpenseForm
          key={editing === "new" ? "new" : editing.id}
          access={a}
          data={data}
          expense={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onDelete={
            editing === "new"
              ? undefined
              : () =>
                  setDeleting({ id: editing.id, version: data.state.version })
          }
          overlay
        />
      )}
      {deleting && (
        <Dialog
          labelledBy={`${tabsId}-delete-title`}
          onClose={() => setDeleting(null)}
          busy={c.uncertain || c.isPending}
          className="space-y-4"
        >
          <h2 id={`${tabsId}-delete-title`} className="text-xl font-semibold">
            지출 삭제 확인
          </h2>
          <p className="text-sm">
            지출을 계산에서 제외합니다. 과거 정산문·입금 사실과 파일은 남습니다.
          </p>
          {deleting.version !== data.state.version && !c.uncertain && (
            <p role="alert">
              정산이 변경되었습니다. 취소 후 다시 확인해 주세요.
            </p>
          )}
          <CommandStatus command={c} />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={c.uncertain || c.isPending}
              onClick={() => setDeleting(null)}
            >
              취소
            </Button>
            <Button
              disabled={
                c.uncertain ||
                c.isPending ||
                deleting.version !== data.state.version
              }
              onClick={() =>
                c.mutate({
                  action: "DELETE_EXPENSE",
                  expectedVersion: deleting.version,
                  id: deleting.id,
                })
              }
            >
              삭제 확인
            </Button>
          </div>
        </Dialog>
      )}
      {record && (
        <>
          <EventFiles access={a} expenses={expenses} />
          <EventFinalization access={a} data={data} />
        </>
      )}
    </div>
  );
}
