"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { EventFiles } from "@/features/files/client";
import { expenseSchema, type ExpenseValues } from "../schemas/expense.schema";
import type { Access, Detail, Expense } from "../types/settlement.types";
import { useSettlementCommand } from "../hooks/use-settlement-command";
import { CommandStatus } from "./command-status";
import { preview } from "../lib/preview";
export function ExpenseForm({
  access: a,
  data,
  expense,
  onClose,
}: {
  access: Access;
  data: Detail;
  expense?: Expense;
  onClose: () => void;
}) {
  const [base, setBase] = useState(data),
    [id] = useState(() => expense?.id ?? crypto.randomUUID()),
    [search, setSearch] = useState(""),
    [reviewed, setReviewed] = useState("");
  const command = useSettlementCommand(a),
    form = useForm<ExpenseValues>({
      resolver: zodResolver(expenseSchema),
      defaultValues: {
        name: expense?.name ?? "",
        total: String(expense?.total ?? ""),
        roundId: expense?.roundId ?? data.facts.rounds[0]?.id ?? "",
        deposit: String(expense?.deposit ?? 0),
        includeDeposit: expense?.includeDeposit ?? true,
        support: String(expense?.support ?? 0),
        reservationId: expense?.reservationId ?? "",
        memo: expense?.memo ?? "",
        payers: expense?.payers.map((p) => p.id) ?? [],
        remainder: expense?.remainder?.id ?? "",
        fileIds: expense?.fileIds ?? [],
      },
    });
  const v = useWatch({ control: form.control }) as ExpenseValues;
  const calc = preview(
    Number(v.total),
    Number(v.deposit),
    v.includeDeposit,
    Number(v.support),
    v.payers.length,
    !!v.remainder,
  );
  const [identityReviewed, setIdentityReviewed] = useState(false);
  const savedPeople = expense
    ? [...expense.payers, ...(expense.remainder ? [expense.remainder] : [])]
    : [];
  const identityChanged =
    !identityReviewed &&
    savedPeople.some(
      (old) =>
        data.facts.participants.find((p) => p.id === old.id)?.version !==
        old.version,
    );
  const rosterChanged =
    v.payers.some(
      (id) =>
        base.facts.participants.find((p) => p.id === id)?.version !==
        data.facts.participants.find((p) => p.id === id)?.version,
    ) ||
    (!!v.remainder &&
      base.facts.participants.find((p) => p.id === v.remainder)?.version !==
        data.facts.participants.find((p) => p.id === v.remainder)?.version);
  const stale =
    base.state.version !== data.state.version ||
    identityChanged ||
    rosterChanged;
  const field = (
    name: "name" | "total" | "deposit" | "support" | "memo",
    label: string,
  ) => (
    <label className="block space-y-2" key={name}>
      <span className="text-xs">{label}</span>
      <Input
        variant="form"
        {...form.register(name)}
        inputMode={
          ["total", "deposit", "support"].includes(name) ? "numeric" : undefined
        }
        aria-invalid={!!form.formState.errors[name]}
        aria-describedby={`${id}-${name}-error`}
      />
      <span id={`${id}-${name}-error`} className="text-xs text-danger">
        {form.formState.errors[name]?.message}
      </span>
    </label>
  );
  const rebase = () => {
    const values = form.getValues(),
      changed = values.payers.filter((id) => {
        const old =
            (!identityReviewed
              ? savedPeople.find((p) => p.id === id)
              : undefined) ?? base.facts.participants.find((p) => p.id === id),
          current = data.facts.participants.find((p) => p.id === id);
        return !current || old?.version !== current.version;
      });
    form.setValue(
      "payers",
      values.payers.filter((id) => !changed.includes(id)),
    );
    if (values.remainder) {
      const old =
          (!identityReviewed
            ? savedPeople.find((p) => p.id === values.remainder)
            : undefined) ??
          base.facts.participants.find((p) => p.id === values.remainder),
        current = data.facts.participants.find(
          (p) => p.id === values.remainder,
        );
      if (!current || old?.version !== current.version)
        form.setValue("remainder", "");
    }
    setReviewed(
      changed.length
        ? "변경·삭제된 사람의 선택을 해제했습니다. 최신 명단에서 다시 선택해 주세요."
        : "입력은 유지했습니다. 최신 지출과 비교한 뒤 명시적으로 저장해 주세요.",
    );
    setIdentityReviewed(true);
    setBase(data);
  };
  return (
    <form
      className="space-y-6 rounded-xl bg-surface p-5"
      onSubmit={form.handleSubmit(async (values) => {
        if (stale || command.uncertain) return;
        const find = (id: string) => {
          const p = base.facts.participants.find((p) => p.id === id);
          return { id, version: p?.version ?? 0 };
        };
        try {
          await command.mutateAsync({
            action: "EXPENSE",
            expectedVersion: base.state.version,
            id,
            ...values,
            total: Number(values.total),
            deposit: Number(values.deposit),
            support: Number(values.support),
            reservationId: values.reservationId || null,
            payers: values.payers.map(find),
            remainder: values.remainder ? find(values.remainder) : null,
          });
          if (command.active.current) onClose();
        } catch {}
      })}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          지출 {expense ? "수정" : "등록"}
        </h2>
        <Button
          variant="outline"
          onClick={onClose}
          disabled={command.uncertain || command.isPending}
        >
          닫기
        </Button>
      </div>
      <fieldset
        className="space-y-6"
        disabled={command.isPending || command.uncertain}
      >
        {field("name", "지출 이름")}
        {field("total", "전체 이용 금액 (예약금 포함)")}
        <label className="block">
          차수
          <select
            className="mt-2 min-h-input w-full rounded-pill border border-field px-3"
            {...form.register("roundId")}
            aria-invalid={!!form.formState.errors.roundId}
            aria-describedby="round-error"
          >
            <option value="">차수 선택</option>
            {data.facts.rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <span id="round-error" className="text-danger">
            {form.formState.errors.roundId?.message}
          </span>
        </label>
        {!data.facts.rounds.length && (
          <Link
            className="text-brand-action underline"
            href={`/events?event=${a.eventId}&view=attendance`}
          >
            참석 화면에서 차수 만들기
          </Link>
        )}
        {field("deposit", "적용할 실제 예약금")}
        {data.reservations.map((r) => {
          const used = data.state.expenses
            .filter(
              (e) =>
                !e.deletedAt &&
                e.id !== id &&
                e.reservationId === r.reservationId,
            )
            .reduce((n, e) => n + e.deposit, 0);
          return (
            <div
              className="rounded-lg bg-choice p-3 text-sm"
              key={r.reservationId}
            >
              <p>
                {r.restaurantName ?? "선택 예약"}: 실제 확인{" "}
                {r.receivedAmount.toLocaleString()}원 / 반환{" "}
                {r.refundedAmount.toLocaleString()}원 / 다른 지출 적용{" "}
                {used.toLocaleString()}원
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  form.setValue(
                    "deposit",
                    String(Math.max(0, r.remainingAmount - used)),
                  );
                  form.setValue("reservationId", r.reservationId);
                }}
              >
                남은 실제 예약금 선택 적용
              </Button>
            </div>
          );
        })}
        <p className="text-xs text-secondary">
          {v.reservationId
            ? "선택 예약의 실제 확인액과 연결됩니다."
            : "직접 입력한 금액입니다. 자금 출처와 중복 사용은 직접 확인해 주세요."}
        </p>
        {v.reservationId && (
          <Button
            variant="outline"
            onClick={() => form.setValue("reservationId", "")}
          >
            예약 연결 해제
          </Button>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" {...form.register("includeDeposit")} />
          예약금을 개인 정산에 포함하기
        </label>
        {field(
          "support",
          "이 지출에 사용할 회비·지원금 (예약금과 중복 차감 주의)",
        )}
        <EventFiles
          access={a}
          expenses={data.state.expenses}
          selected={v.fileIds}
          onSelect={(ids) => form.setValue("fileIds", ids)}
        />
        <section className="space-y-3">
          <h3 className="font-semibold">
            비용을 나눌 사람{" "}
            <span className="text-brand-action">{v.payers.length}</span>
          </h3>
          <Button
            variant="brand-outline"
            onClick={() => {
              const r = data.facts.rounds.find((r) => r.id === v.roundId);
              form.setValue("payers", r?.attendingIds ?? []);
            }}
          >
            이 차수 참석자를 선택에 반영
          </Button>
          <p className="text-xs text-secondary">
            참석 응답이 바뀌어도 저장된 부담자는 자동 변경되지 않습니다.
          </p>
          <Input
            aria-label="부담자 이름·전화번호 뒤4자리 검색"
            placeholder="이름·전화번호 뒤4자리·구분"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-80 overflow-y-auto rounded-[20px] border border-field p-4">
            {base.facts.participants
              .filter((p) =>
                [p.name, p.label, p.phoneLast4].some((x) =>
                  x?.includes(search),
                ),
              )
              .map((p) => (
                <label
                  key={p.id}
                  className="flex min-h-control items-center justify-between gap-3 py-2"
                >
                  <span>
                    {p.name} {p.label && `(${p.label})`}
                    <small className="block text-secondary">
                      {p.phoneLast4 ?? "뒤4자리 없음"}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={v.payers.includes(p.id)}
                    onChange={(e) =>
                      form.setValue(
                        "payers",
                        e.target.checked
                          ? [...v.payers, p.id]
                          : v.payers.filter((id) => id !== p.id),
                      )
                    }
                  />
                </label>
              ))}
          </div>
        </section>
        <label className="block">
          잔액 담당자 (균등 부담자 외에도 선택 가능)
          <select
            className="my-2 min-h-input w-full rounded-pill border border-field px-3"
            {...form.register("remainder")}
          >
            <option value="">선택 안 함</option>
            {base.facts.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.label ?? ""} {p.phoneLast4 ?? ""}
              </option>
            ))}
          </select>
        </label>
        {field("memo", "지출 메모")}
        <div aria-live="polite" className="rounded-xl bg-choice p-4">
          {calc.error ??
            `정산 대상 ${calc.target?.toLocaleString()}원 · 균등 ${calc.each?.toLocaleString()}원 · 지정인 잔액 ${calc.rest}원`}
          {calc.draft && (
            <p>
              부담자 또는 잔액 담당자를 정하지 않아 초안으로 저장합니다. 정산문
              생성 전에 완료해 주세요.
            </p>
          )}
        </div>
      </fieldset>
      {stale && !command.uncertain && (
        <div role="alert">
          <p>
            최신 정산 버전 {data.state.version}. 입력 기준은{" "}
            {base.state.version}입니다. 다른 사람의 변경을 확인해 주세요.
          </p>
          <ul>
            {data.state.expenses
              .filter((e) => !e.deletedAt)
              .map((e) => (
                <li key={e.id}>
                  {e.name}: {e.total.toLocaleString()}원 / 부담자{" "}
                  {e.payers.length}명
                </li>
              ))}
          </ul>
          <Button variant="outline" onClick={rebase}>
            최신 내용 확인 · 입력 재검토
          </Button>
        </div>
      )}
      {reviewed && <p role="status">{reviewed}</p>}
      <CommandStatus command={command} />
      <Button
        type="submit"
        disabled={
          stale || !!calc.error || command.uncertain || command.isPending
        }
      >
        {calc.draft ? "초안 저장" : "지출 저장"}
      </Button>
    </form>
  );
}
