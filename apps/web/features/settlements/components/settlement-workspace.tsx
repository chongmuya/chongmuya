"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
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
import { confirmationDeadline } from "../lib/confirmation-deadline";
const validReturnTime = (value: string) =>
  !!value &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) <= Date.now();
const reasonSchema = z.object({
  amount: z.string().regex(/^\d+$/, "정수 금액을 입력해 주세요."),
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
        amount: String(row?.excess ?? 0),
        reason: "",
        returnedAt: "",
      },
    });
  return (
    <form
      className="space-y-3 rounded-lg border border-field p-4"
      onSubmit={form.handleSubmit(async (v) => {
        if (target.kind === "RETURN" && !validReturnTime(v.returnedAt)) {
          form.setError("returnedAt", {
            message: "실제 반환한 시각을 현재 이전으로 입력해 주세요.",
          });
          return;
        }
        try {
          await c.mutateAsync({
            action: target.kind,
            expectedVersion: base,
            ...(target.kind === "RETURN"
              ? {
                  participantId: target.participantId,
                  amount: Number(v.amount),
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
          <label>
            실제 반환 시각
            <Input
              type="datetime-local"
              {...form.register("returnedAt")}
              aria-invalid={!!form.formState.errors.returnedAt}
              aria-describedby="return-time-error"
            />
            <span id="return-time-error" className="text-danger">
              {form.formState.errors.returnedAt?.message}
            </span>
          </label>
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
  const c = useSettlementCommand(a),
    [target, setTarget] = useState<{
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
    <div className="space-y-5">
      <p className="text-xs text-secondary">
        입금 여부는 총무가 직접 확인합니다. 기한 경과는 실제 미입금 판정이
        아닙니다.
      </p>
      <p className="text-xs text-secondary">
        좁은 화면에서는 표를 좌우로 움직여 차수별 금액을 확인할 수 있어요.
      </p>
      <div className="overflow-x-auto p-1">
        <table className="w-full min-w-[300px] text-xs">
          <caption className="sr-only">개인별 정산과 차수별 부담액</caption>
          <thead>
            <tr>
              <th>이름</th>
              {data.facts.rounds.map((r) => (
                <th key={r.id}>{r.title}</th>
              ))}
              <th>총 정산금 / 확인</th>
            </tr>
          </thead>
          <tbody>
            {data.summary.people.map((p) => (
              <tr key={p.person.id} className="border-b border-field">
                <th className="min-w-16 py-4 text-left font-medium">
                  {p.person.name}
                  <small className="block text-secondary">
                    {p.person.label} {p.person.phoneLast4}
                  </small>
                </th>
                {data.facts.rounds.map((r) => (
                  <td key={r.id} className="px-2 text-right">
                    {(p.rounds[r.id] ?? 0).toLocaleString()}
                  </td>
                ))}
                <td className="min-w-28 py-4 text-right">
                  <strong>{p.amount.toLocaleString()}원</strong>
                  <small className="block">
                    순확인 {p.net.toLocaleString()}원
                  </small>
                  {p.remaining > 0 && (
                    <>
                      <small className="block text-brand">
                        미확인 {p.remaining.toLocaleString()}원
                      </small>
                      <Button
                        disabled={c.isPending || c.uncertain}
                        onClick={() =>
                          setConfirm({
                            id: p.person.id,
                            amount: p.remaining,
                            version: data.state.version,
                            calculationVersion: data.state.calculationVersion,
                          })
                        }
                      >
                        입금 확인
                      </Button>
                    </>
                  )}
                  {p.excess > 0 && (
                    <small className="block text-danger">
                      초과확인 {p.excess.toLocaleString()}원 · 반환/정정 확인
                      필요
                    </small>
                  )}
                  {p.net > 0 && (
                    <Button
                      variant="outline"
                      disabled={c.uncertain || c.isPending}
                      onClick={() =>
                        setTarget({
                          participantId: p.person.id,
                          kind: "RETURN",
                        })
                      }
                    >
                      실제 반환 기록
                    </Button>
                  )}
                  {!p.remaining && !p.excess && (
                    <span className="text-brand">
                      {p.amount ? "확인됨" : "입금 불필요"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirm && (
        <div role="alertdialog" aria-label="입금 확인 기록">
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
            onClick={async () => {
              try {
                await c.mutateAsync({
                  action: "RECEIPT",
                  expectedVersion: confirm.version,
                  calculationVersion: confirm.calculationVersion,
                  participantId: confirm.id,
                  amount: confirm.amount,
                });
                if (c.active.current) setConfirm(null);
              } catch {}
            }}
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
        </div>
      )}
      <CommandStatus command={c} />
      <details>
        <summary>입금·반환·정정 이력 {data.state.payments.length}건</summary>
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
}: Access & { record?: boolean }) {
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
      <Loaded access={a} data={q.data} record={record} />
    </>
  );
}
function Loaded({
  access: a,
  data,
  record,
}: {
  access: Access;
  data: Detail;
  record: boolean;
}) {
  const deadline = confirmationDeadline(data);
  // Decide once on entry. Closing the reminder or background refreshes must not
  // interrupt an existing form; the current unconfirmed count can reopen it.
  const [deadlineOpen, setDeadlineOpen] = useState(() => !record && !!deadline);
  const [noticeFlow, setNoticeFlow] = useState(false);
  const [createNoticeScope, setCreateNoticeScope] = useState<
    Notice["scope"] | null
  >(null);
  const [tab, setTab] = useState("expenses"),
    [editing, setEditing] = useState<Expense | "new" | null>(null),
    [deleting, setDeleting] = useState<{ id: string; version: number } | null>(
      null,
    ),
    c = useSettlementCommand(a),
    s = data.summary;
  return (
    <div className="space-y-7">
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
      <div hidden={noticeFlow} className="space-y-7">
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <div className="rounded-lg bg-surface p-4 shadow-sm">
            <p className="text-xs text-secondary">입금 확인 인원</p>
            <p className="mt-4 text-2xl font-semibold">
              {s.confirmed}
              <small className="text-xs text-secondary">
                {" "}
                / {s.people.filter((p) => p.amount > 0).length}명
              </small>
            </p>
          </div>
          <dl className="rounded-lg bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-xs text-secondary">전체 지출</dt>
              <dd className="font-semibold">{s.total.toLocaleString()}원</dd>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2">
              <dt className="text-xs text-secondary">정산 대상</dt>
              <dd>{s.target.toLocaleString()}원</dd>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2">
              <dt className="text-xs text-secondary">순입금 확인</dt>
              <dd>{s.received.toLocaleString()}원</dd>
            </div>
          </dl>
        </div>
        <p className="text-sm">
          {
            {
              EMPTY: "정산 데이터 없음",
              IN_PROGRESS: "정산 진행 중",
              COMPLETE: "정산 완료",
            }[s.status]
          }{" "}
          · 미완성 {s.drafts}개 ·{" "}
          {deadline ? (
            <button
              type="button"
              aria-haspopup="dialog"
              className="underline underline-offset-2"
              onClick={() => setDeadlineOpen(true)}
            >
              미확인 {s.unconfirmed}명
            </button>
          ) : (
            <>미확인 {s.unconfirmed}명</>
          )}{" "}
          · 초과확인 {s.differences}명
        </p>
      </div>
      {editing && (
        <ExpenseForm
          key={editing === "new" ? "new" : editing.id}
          access={a}
          data={data}
          expense={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <section
        hidden={!!editing}
        className={
          noticeFlow
            ? "space-y-6"
            : "space-y-6 rounded-lg bg-surface p-5 shadow-sm"
        }
      >
        <div
          hidden={noticeFlow}
          className="flex rounded-pill border border-brand p-1"
          role="tablist"
          aria-label="정산 내용"
        >
          {[
            ["expenses", "지출 확인"],
            ["people", "개인별 정산"],
            ["notices", "정산문 쓰기"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`min-h-control flex-1 rounded-pill px-2 text-xs ${tab === id ? "bg-brand text-copy" : "text-secondary"}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div hidden={tab !== "expenses"} className="space-y-5">
          <div className="text-right">
            <Button variant="outline" onClick={() => setEditing("new")}>
              + 지출 등록
            </Button>
          </div>
          {!data.state.expenses.some((e) => !e.deletedAt) && (
            <p className="py-10 text-center">첫 지출을 등록해 주세요.</p>
          )}
          {data.state.expenses
            .filter((e) => !e.deletedAt)
            .map((e) => (
              <article
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="shrink-0 rounded-lg bg-brand px-2 py-3 text-copy">
                    {data.facts.rounds.find((r) => r.id === e.roundId)?.title ??
                      "차수"}
                  </span>
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">{e.name}</h3>
                    <small className="text-secondary">
                      부담자 {e.payers.length}명 · 예약금{" "}
                      {e.includeDeposit ? "포함" : "제외"}
                    </small>
                    <p className="font-semibold">
                      {e.total.toLocaleString()}원
                    </p>
                  </div>
                </div>
                <div className="flex w-full justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditing(e)}>
                    수정
                  </Button>
                  <Button
                    variant="outline"
                    disabled={c.uncertain || c.isPending}
                    onClick={() =>
                      setDeleting({ id: e.id, version: data.state.version })
                    }
                  >
                    삭제
                  </Button>
                </div>
              </article>
            ))}
          {deleting && (
            <div role="alertdialog" aria-label="지출 삭제 확인">
              <p>
                지출을 계산에서 제외합니다. 과거 정산문·입금 사실과 파일은
                남습니다.
              </p>
              <Button
                disabled={
                  c.uncertain ||
                  c.isPending ||
                  deleting.version !== data.state.version
                }
                onClick={async () => {
                  try {
                    await c.mutateAsync({
                      action: "DELETE_EXPENSE",
                      expectedVersion: deleting.version,
                      id: deleting.id,
                    });
                    if (c.active.current) setDeleting(null);
                  } catch {}
                }}
              >
                삭제 확인
              </Button>
              <Button
                variant="outline"
                disabled={c.uncertain || c.isPending}
                onClick={() => setDeleting(null)}
              >
                취소
              </Button>
              {deleting.version !== data.state.version && !c.uncertain && (
                <p>정산이 변경되었습니다. 취소 후 다시 확인해 주세요.</p>
              )}
            </div>
          )}
          <CommandStatus command={c} />
        </div>
        <div hidden={tab !== "people"}>
          <People a={a} data={data} />
        </div>
        <div hidden={tab !== "notices"}>
          <NoticePanel
            access={a}
            data={data}
            onFlowChange={setNoticeFlow}
            createScope={createNoticeScope}
            onCreateScopeHandled={() => setCreateNoticeScope(null)}
          />
        </div>
      </section>
      {record && (
        <EventFiles
          access={a}
          expenses={data.state.expenses.filter((e) => !e.deletedAt)}
        />
      )}
    </div>
  );
}
