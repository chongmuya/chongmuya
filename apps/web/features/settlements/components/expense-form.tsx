"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  useController,
  useForm,
  useWatch,
  type Control,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { FormField } from "@/shared/ui/form-field";
import { IconButton } from "@/shared/ui/icon-button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { EventFiles } from "@/features/files/client";
import { expenseSchema, type ExpenseValues } from "../schemas/expense.schema";
import type { Access, Detail, Expense } from "../types/settlement.types";
import { useSettlementCommand } from "../hooks/use-settlement-command";
import { CommandStatus } from "./command-status";
import { ExpensePayers } from "./expense-payers";
import { SettlementCheckbox } from "./settlement-checkbox";
import { SettlementScreen } from "./settlement-screen";
import { preview } from "../lib/preview";

type AmountName = "total" | "deposit" | "support";

const fieldLabel = "text-xs leading-[normal]";
const summaryStyle = "cursor-pointer text-sm text-secondary";

function MoneyInput({
  control,
  name,
  ...props
}: React.ComponentProps<typeof Input> & {
  control: Control<ExpenseValues>;
  name: AmountName;
}) {
  const { field } = useController({ control, name });
  const [focused, setFocused] = useState(false);
  return (
    <Input
      {...props}
      {...field}
      variant="form"
      inputMode="numeric"
      value={
        !focused && /^\d+$/.test(field.value)
          ? Number(field.value).toLocaleString("ko-KR")
          : field.value
      }
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        field.onBlur();
      }}
      onChange={(event) =>
        field.onChange(event.target.value.replaceAll(",", ""))
      }
    />
  );
}

export function ExpenseForm({
  access: a,
  data,
  expense,
  onClose,
  onDelete,
  overlay = false,
}: {
  access: Access;
  data: Detail;
  expense?: Expense;
  onClose: () => void;
  onDelete?: () => void;
  overlay?: boolean;
}) {
  const titleId = useId();
  const payerButton = useRef<HTMLButtonElement>(null);
  const restorePayerFocus = useRef(false);
  const [base, setBase] = useState(data);
  const [id] = useState(() => expense?.id ?? crypto.randomUUID());
  const [picking, setPicking] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [draftWarning, setDraftWarning] = useState<ExpenseValues | null>(null);
  const [reviewed, setReviewed] = useState("");
  const [identityReviewed, setIdentityReviewed] = useState(false);
  const command = useSettlementCommand(a, () => onClose());
  const busy = command.isPending || command.uncertain;
  const form = useForm<ExpenseValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      name: expense?.name ?? "",
      total: expense ? String(expense.total) : "",
      roundId: expense?.roundId ?? data.facts.rounds[0]?.id ?? "",
      deposit: expense ? String(expense.deposit) : "",
      includeDeposit: expense?.includeDeposit ?? true,
      support: expense ? String(expense.support) : "",
      reservationId: expense?.reservationId ?? "",
      memo: expense?.memo ?? "",
      payers: expense?.payers.map((p) => p.id) ?? [],
      remainder: expense?.remainder?.id ?? "",
      fileIds: expense?.fileIds ?? [],
    },
  });
  const values = useWatch({ control: form.control }) as ExpenseValues;
  const calc = preview(
    Number(values.total),
    Number(values.deposit),
    values.includeDeposit,
    Number(values.support),
    values.payers.length,
    !!values.remainder,
  );
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
  const rosterChanged = [...values.payers, values.remainder]
    .filter(Boolean)
    .some(
      (personId) =>
        base.facts.participants.find((p) => p.id === personId)?.version !==
        data.facts.participants.find((p) => p.id === personId)?.version,
    );
  const stale =
    base.state.version !== data.state.version ||
    identityChanged ||
    rosterChanged;
  const amountField = (
    name: AmountName,
    label: string,
    placeholder?: string,
  ) => (
    <FormField
      id={`${titleId}-${name}`}
      label={label}
      error={form.formState.errors[name]?.message}
      className="min-w-0 gap-2.5"
      labelClassName={fieldLabel}
    >
      {(attributes) => (
        <MoneyInput
          {...attributes}
          control={form.control}
          name={name}
          placeholder={placeholder}
          className={name === "support" ? "placeholder:text-xs" : undefined}
        />
      )}
    </FormField>
  );

  const rebase = () => {
    const current = form.getValues();
    const changed = (personId: string) => {
      const old =
        (!identityReviewed
          ? savedPeople.find((p) => p.id === personId)
          : undefined) ??
        base.facts.participants.find((p) => p.id === personId);
      const latest = data.facts.participants.find((p) => p.id === personId);
      return !latest || old?.version !== latest.version;
    };
    const payers = current.payers.filter((personId) => !changed(personId));
    const remainderRemoved = !!current.remainder && changed(current.remainder);
    form.setValue("payers", payers);
    if (remainderRemoved) form.setValue("remainder", "");
    setReviewed(
      payers.length !== current.payers.length || remainderRemoved
        ? "변경·삭제된 사람의 선택을 해제했습니다. 최신 명단에서 다시 선택해 주세요."
        : "입력은 유지했습니다. 최신 지출과 비교한 뒤 저장해 주세요.",
    );
    setIdentityReviewed(true);
    setBase(data);
  };

  const save = async (next: ExpenseValues) => {
    if (stale || busy || uploadBusy) return;
    const person = (id: string) => ({
      id,
      version: base.facts.participants.find((p) => p.id === id)?.version ?? 0,
    });
    try {
      await command.mutateAsync({
        action: "EXPENSE",
        expectedVersion: base.state.version,
        id,
        ...next,
        total: Number(next.total),
        deposit: Number(next.deposit),
        support: Number(next.support),
        reservationId: next.reservationId || null,
        payers: next.payers.map(person),
        remainder: next.remainder ? person(next.remainder) : null,
      });
    } catch {
      // CommandStatus presents failures and lets the user retry the same request.
    }
  };

  useEffect(() => {
    if (!picking && restorePayerFocus.current) {
      restorePayerFocus.current = false;
      payerButton.current?.focus();
    }
  }, [picking]);

  const closePicker = () => {
    restorePayerFocus.current = true;
    setPicking(false);
  };
  const body = (
    <>
      <form
        hidden={picking}
        className="space-y-7 px-[22px] pt-4 pb-7"
        onSubmit={form.handleSubmit(async (next) => {
          if (stale || busy || picking || uploadBusy) return;
          const result = preview(
            Number(next.total),
            Number(next.deposit),
            next.includeDeposit,
            Number(next.support),
            next.payers.length,
            !!next.remainder,
          );
          if (result.error) {
            form.setError(
              "total",
              { message: result.error },
              { shouldFocus: true },
            );
            return;
          }
          if (result.draft && !next.payers.length) {
            setDraftWarning(next);
            return;
          }
          await save(next);
        })}
      >
        <header className="flex min-h-11 items-center gap-0.5">
          <IconButton
            className="-ml-4"
            aria-label="닫기"
            onClick={onClose}
            disabled={busy}
          >
            <Image src="/images/ui/close.svg" alt="" width={15} height={15} />
          </IconButton>
          <h2
            id={picking ? undefined : titleId}
            className="text-control font-medium"
          >
            {expense ? "지출 수정" : "지출 등록"}
          </h2>
        </header>
        <fieldset className="-mt-[13px] space-y-4" disabled={busy}>
          <FormField
            id={`${titleId}-name`}
            label="지출 이름"
            error={form.formState.errors.name?.message}
            className="gap-3"
            labelClassName={fieldLabel}
          >
            {(attributes) => (
              <Input
                {...attributes}
                {...form.register("name")}
                variant="form"
                placeholder="예: 식사, 주류"
              />
            )}
          </FormField>
          <div className="grid grid-cols-2 items-start gap-3.5">
            {amountField("total", "결제 금액")}
            <FormField
              id={`${titleId}-round`}
              label="차수"
              error={form.formState.errors.roundId?.message}
              className="min-w-0 gap-2.5"
              labelClassName={fieldLabel}
            >
              {(attributes) => (
                <div className="relative w-full">
                  <Select
                    {...attributes}
                    {...form.register("roundId")}
                    className={`bg-none! py-2.5 font-medium ${!expense && !form.formState.dirtyFields.roundId ? "text-placeholder" : ""}`}
                  >
                    <option value="">차수 선택</option>
                    {data.facts.rounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.title}
                      </option>
                    ))}
                  </Select>
                  <Image
                    src="/images/settlements/next.svg"
                    alt=""
                    width={8}
                    height={13}
                    className="pointer-events-none absolute inset-y-0 right-4 my-auto -rotate-90 forced-colors:hidden"
                  />
                </div>
              )}
            </FormField>
          </div>
          {!data.facts.rounds.length && (
            <Link
              className="text-sm text-brand underline"
              href={`/events?event=${a.eventId}&view=attendance`}
            >
              참석 화면에서 차수 만들기
            </Link>
          )}
          {amountField("deposit", "예약금")}
          {(data.reservations.length > 0 || values.reservationId) && (
            <details className="space-y-2 rounded-control bg-choice p-3 text-xs">
              <summary className="cursor-pointer">
                {values.reservationId
                  ? "연결된 예약금 확인"
                  : "실제 예약금 연결"}
              </summary>
              {data.reservations.map((reservation) => {
                const used = data.state.expenses
                  .filter(
                    (item) =>
                      !item.deletedAt &&
                      item.id !== id &&
                      item.reservationId === reservation.reservationId,
                  )
                  .reduce((sum, item) => sum + item.deposit, 0);
                return (
                  <div className="space-y-2" key={reservation.reservationId}>
                    <p>
                      {reservation.restaurantName ?? "선택 예약"} · 확인{" "}
                      {reservation.receivedAmount.toLocaleString()}원 · 반환{" "}
                      {reservation.refundedAmount.toLocaleString()}원 · 다른
                      지출에 적용 {used.toLocaleString()}원
                    </p>
                    <Button
                      variant="outline"
                      className="text-sm"
                      onClick={() => {
                        form.setValue(
                          "deposit",
                          String(
                            Math.max(0, reservation.remainingAmount - used),
                          ),
                        );
                        form.setValue(
                          "reservationId",
                          reservation.reservationId,
                        );
                      }}
                    >
                      남은 실제 예약금 선택 적용
                    </Button>
                  </div>
                );
              })}
              {values.reservationId && (
                <Button
                  variant="outline"
                  className="text-sm"
                  onClick={() => form.setValue("reservationId", "")}
                >
                  예약 연결 해제
                </Button>
              )}
            </details>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <SettlementCheckbox {...form.register("includeDeposit")} />
            예약금 정산에 포함하기
          </label>
          {amountField("support", "회비", "회비로 계산할 금액을 입력해주세요")}
          <EventFiles
            access={a}
            selected={values.fileIds}
            onUploadBusyChange={setUploadBusy}
            onSelect={(ids) => form.setValue("fileIds", ids)}
            onUploaded={(fileId) =>
              form.setValue("fileIds", [
                ...new Set([...form.getValues("fileIds"), fileId]),
              ])
            }
          />
          <button
            type="button"
            ref={payerButton}
            aria-label="비용을 나눌 사람"
            className="flex min-h-10 cursor-pointer items-center gap-3 text-control font-medium"
            onClick={(event) => {
              const dialog = event.currentTarget.closest("dialog");
              if (dialog) dialog.scrollTop = 0;
              setPicking(true);
            }}
          >
            비용을 나눌 사람
            {values.payers.length > 0 && (
              <span className="text-sm font-semibold text-brand">
                {values.payers.length}
              </span>
            )}
            <Image
              src="/images/settlements/next.svg"
              className="rotate-180"
              alt=""
              width={8}
              height={13}
            />
          </button>
          {values.payers.length > 0 &&
            (!expense || form.getFieldState("payers").isDirty) && (
              <ul
                aria-label="선택한 부담자"
                className="rounded-card border border-placeholder px-[clamp(16px,10vw,42px)] py-1"
              >
                {values.payers.map((personId) => {
                  const person =
                    base.facts.participants.find((p) => p.id === personId) ??
                    expense?.payers.find((p) => p.id === personId);
                  return (
                    <li
                      key={personId}
                      className="flex min-h-[59px] items-center gap-3"
                    >
                      <span className="min-w-0 font-semibold text-sm wrap-anywhere">
                        {person?.name ?? "이전 부담자"}
                        {person?.label && ` (${person.label})`}
                      </span>
                      <span className="text-secondary">
                        {person?.phoneLast4}
                      </span>
                      <IconButton
                        className="ml-auto -mr-3"
                        aria-label={`${person?.name ?? "이전 부담자"} 제외`}
                        onClick={() =>
                          form.setValue(
                            "payers",
                            values.payers.filter((id) => id !== personId),
                            { shouldDirty: true },
                          )
                        }
                      >
                        <Image
                          src="/images/settlements/remove.svg"
                          alt=""
                          width={18}
                          height={20}
                        />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            )}
          {calc.error && Number(values.total) > 0 && (
            <p role="alert" className="text-sm text-danger">
              {calc.error}
            </p>
          )}
        </fieldset>
        {stale && !command.uncertain && (
          <div role="alert" className="space-y-2 text-sm">
            <p>
              다른 사람이 정산 내용을 변경했어요. 최신 지출을 확인해 주세요.
            </p>
            <ul>
              {data.state.expenses
                .filter((item) => !item.deletedAt)
                .map((item) => (
                  <li key={item.id}>
                    {item.name} · {item.total.toLocaleString()}원 ·{" "}
                    {item.payers.length}명
                  </li>
                ))}
            </ul>
            <Button variant="outline" onClick={rebase}>
              최신 내용 확인 · 입력 재검토
            </Button>
          </div>
        )}
        {reviewed && (
          <p role="status" className="text-sm">
            {reviewed}
          </p>
        )}
        <CommandStatus command={command} />
        <fieldset className="flex min-w-0 items-start gap-4" disabled={busy}>
          <Button
            className="min-h-[50px] shrink-0 px-5 text-sm"
            type="submit"
            disabled={stale || busy || uploadBusy}
          >
            {expense
              ? "지출 수정"
              : calc.draft && values.payers.length > 0
                ? "초안 저장"
                : "지출 등록"}
          </Button>
          <details className="min-w-0 flex-1 space-y-3 pt-3.5">
            <summary className={summaryStyle}>
              {(calc.rest ?? 0) > 0 && !values.remainder
                ? `잔액 ${calc.rest}원 담당자 선택`
                : "지출 상세 설정"}
            </summary>
            <label className="block space-y-2">
              <span className={fieldLabel}>잔액 담당자</span>
              <Select {...form.register("remainder")}>
                <option value="">선택 안 함</option>
                {base.facts.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.label} {p.phoneLast4}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-2">
              <span className={fieldLabel}>지출 메모</span>
              <Input
                variant="form"
                {...form.register("memo")}
                maxLength={300}
              />
            </label>
            {onDelete && (
              <Button
                variant="outline"
                className="text-danger"
                onClick={onDelete}
              >
                지출 삭제
              </Button>
            )}
          </details>
        </fieldset>
      </form>
      {picking && (
        <ExpensePayers
          facts={base.facts}
          roundId={values.roundId}
          selected={values.payers}
          titleId={titleId}
          onClose={closePicker}
          onApply={(ids) => {
            form.setValue("payers", ids, { shouldDirty: true });
            closePicker();
          }}
        />
      )}
      {draftWarning && (
        <Dialog
          labelledBy={`${titleId}-warning`}
          describedBy={`${titleId}-warning-description`}
          className="max-w-[322px] space-y-2 pt-[60px] text-center"
          onClose={() => setDraftWarning(null)}
        >
          <Image
            src="/images/settlements/warning.svg"
            alt=""
            width={71}
            height={64}
            className="mx-auto mb-7"
          />
          <h2
            id={`${titleId}-warning`}
            className="text-2xl leading-tight font-bold"
          >
            비용을 나눌 사람이 없어요
          </h2>
          <p
            id={`${titleId}-warning-description`}
            className="mb-7 text-control"
          >
            비용을 나눌 참여자를 골라주세요
          </p>
          <Button
            className="w-full"
            onClick={() => {
              setDraftWarning(null);
              setPicking(true);
            }}
          >
            확인
          </Button>
          <Button
            className="w-full border-2 text-brand"
            variant="brand-outline"
            disabled={stale}
            onClick={() => {
              setDraftWarning(null);
              void save(draftWarning);
            }}
          >
            초안 저장
          </Button>
        </Dialog>
      )}
    </>
  );

  return overlay ? (
    <SettlementScreen
      titleId={titleId}
      white
      busy={busy}
      onClose={picking ? closePicker : onClose}
    >
      {body}
    </SettlementScreen>
  ) : (
    body
  );
}
