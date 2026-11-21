"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { menuSchema } from "../schemas/menu.schema";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useCompletionCommand } from "../hooks/use-completion-command";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { UncertainCommand } from "./uncertain-command";
import { won } from "../lib/agreement-labels";
import { depositGuidanceReady } from "../lib/deposit-guidance";
import { MenuDeposit } from "./menu-deposit";
export function MenuForm({
  data: q,
  access,
}: {
  data: Completion;
  access: CompletionAccess;
}) {
  const [catalogReviewed, setCatalogReviewed] = useState(
    !q.draft || q.draft.catalogVersion === q.catalog.version,
  );
  const [base, setBase] = useState(q),
    action = useCompletionCommand(q.id, access);
  const form = useForm({
      resolver: zodResolver(menuSchema),
      defaultValues: {
        items: base.catalog.menus.map((m) => ({
          id: m.id,
          quantity: base.draft?.items.find((i) => i.id === m.id)?.quantity ?? 0,
        })),
        confirmed: false,
        payer: "",
        amount: "",
      },
    }),
    items = useWatch({ control: form.control, name: "items" });
  const [payer, amount] = useWatch({
    control: form.control,
    name: ["payer", "amount"],
  });
  const closed = !!q.order || !!q.cancellation;
  const catalogChanged =
    !catalogReviewed || q.catalog.version !== base.catalog.version;
  const guidanceChanged = q.guidance.revision !== base.guidance.revision;
  const changed =
    catalogChanged || guidanceChanged || q.version !== base.version;
  const canOrder = base.catalog.menus.some(
    (m) => m.available && m.price !== null,
  );
  const unknownTotal = items.some(
    (i) =>
      i.quantity > 0 &&
      base.catalog.menus.find((m) => m.id === i.id)?.price == null,
  );
  const total = items.reduce((sum, i) => {
    const menu = base.catalog.menus.find((m) => m.id === i.id);
    return sum + (menu?.price ?? 0) * (i.quantity || 0);
  }, 0);
  const guidance = base.guidance;
  const ready = depositGuidanceReady(base);
  const canReport = ready && guidance.kind === "REQUIRED";
  async function save(draft: boolean) {
    await form.handleSubmit(async (values) => {
      if (closed || changed || action.isPending || action.uncertain) return;
      if (!draft && !canOrder) return;
      if (!draft && !values.confirmed) {
        form.setError("confirmed", {
          message: ready
            ? "메뉴·예약금·변경 조건을 확인해 주세요."
            : "보낼 메뉴와 현재 안내를 확인해 주세요.",
        });
        return;
      }
      const transfer =
        canReport && (values.payer || values.amount)
          ? { payer: values.payer, amount: Number(values.amount) }
          : undefined;
      if (
        !draft &&
        transfer &&
        (!transfer.payer ||
          !Number.isSafeInteger(transfer.amount) ||
          transfer.amount <= 0 ||
          transfer.amount > 2_000_000_000)
      ) {
        form.setError("amount", {
          message: "입금자명과 1~20억 원의 신고 금액을 확인해 주세요.",
        });
        return;
      }
      try {
        const result = await action.mutateAsync({
          action: draft ? "menu-draft" : "menu-submit",
          input: {
            expectedVersion: base.version,
            catalogVersion: base.catalog.version,
            items: values.items,
            ...(!draft
              ? {
                  guidanceRevision: base.guidance.revision,
                  confirmed: true,
                  ...(transfer ? { transfer } : {}),
                }
              : {}),
          },
        });
        if (action.active.current) {
          setBase({ ...result, catalog: base.catalog });
          form.reset(form.getValues());
        }
      } catch {
        /* Input and command identity survive explicit retries. */
      }
    })();
  }
  if (
    closed &&
    !form.formState.isDirty &&
    !action.uncertain &&
    !action.isPending
  )
    return null;
  return (
    <form
      noValidate
      className="space-y-7"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      {closed && (
        <p role="alert">
          다른 화면에서 메뉴를 전달했거나 예약을 종료했어요. 작성 내용은
          보존했으며 추가 저장은 할 수 없어요.
        </p>
      )}
      <fieldset
        disabled={closed || action.uncertain || action.isPending}
        className="min-w-0 space-y-7"
      >
        <h2 className="text-2xl leading-tight font-bold break-keep">
          {canReport
            ? "입금 정보를 확인해 주세요"
            : "예약 메뉴를 선택해 주세요"}
        </h2>
        <section className="rounded-control bg-surface p-5 shadow-card">
          <h3 className="mb-5 text-base font-medium">메뉴 선택</h3>
          {(form.formState.isDirty || q.draft) && (
            <p className="mb-3 text-xs text-muted">
              {form.formState.isDirty
                ? "저장하지 않은 변경이 있어요."
                : "임시 저장한 수량을 불러왔어요."}
            </p>
          )}
          {!base.catalog.menus.length ? (
            <p className="text-sm">
              등록된 메뉴가 없어요. 매장에 메뉴 등록을 요청해 주세요.
            </p>
          ) : !canOrder ? (
            <p role="status" className="text-sm text-muted">
              지금 주문할 수 있는 메뉴가 없어요. 매장에 가격과 판매 여부를
              확인해 주세요.
            </p>
          ) : null}
          <ul>
            {base.catalog.menus.map((m, index) => {
              const available = m.available && m.price !== null;
              const quantity = items[index]?.quantity || 0;
              const error =
                form.formState.errors.items?.[index]?.quantity?.message;
              return (
                <li key={m.id} className="px-2 py-4 max-[360px]:px-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="grid size-[50px] shrink-0 place-items-center rounded-sm bg-soft">
                        <Image
                          src="/images/restaurants/menu.svg"
                          width={28}
                          height={28}
                          alt=""
                        />
                      </div>
                      <div className="min-w-0 space-y-0.5 leading-tight wrap-anywhere">
                        <p className="text-base font-medium">{m.name}</p>
                        <p className="text-[10px] text-muted">{m.unit}</p>
                        <p className="text-sm font-semibold">
                          {m.price === null ? "가격 확인 중" : won(m.price)}
                          {!m.available ? " · 품절" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center rounded-control text-muted">
                      <Button
                        variant="outline"
                        className="w-8 border-transparent p-0 text-base text-muted"
                        aria-label={`${m.name} 수량 줄이기`}
                        disabled={!available || quantity <= 0}
                        onClick={() =>
                          form.setValue(
                            `items.${index}.quantity`,
                            Math.max(0, quantity - 1),
                            { shouldDirty: true },
                          )
                        }
                      >
                        −
                      </Button>
                      <label className="sr-only" htmlFor={`menu-${m.id}`}>
                        {m.name} 수량
                      </label>
                      <Input
                        id={`menu-${m.id}`}
                        className="min-h-control w-11 appearance-none border-transparent bg-transparent px-0 text-center text-sm text-muted tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100000}
                        disabled={!available}
                        aria-invalid={!!error}
                        aria-describedby={
                          error ? `menu-${m.id}-error` : undefined
                        }
                        {...form.register(`items.${index}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                      <Button
                        variant="outline"
                        className="w-8 border-transparent p-0 text-base text-muted"
                        aria-label={`${m.name} 수량 늘리기`}
                        disabled={!available || quantity >= 100000}
                        onClick={() =>
                          form.setValue(
                            `items.${index}.quantity`,
                            Math.min(100000, quantity + 1),
                            { shouldDirty: true },
                          )
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <FormError id={`menu-${m.id}-error`} message={error} />
                  {!available && quantity > 0 && (
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={() =>
                        form.setValue(`items.${index}.quantity`, 0, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      {m.name} 선택 해제
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="space-y-2 border-t border-placeholder pt-5">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-xs text-muted">메뉴 주문 금액</span>
              <strong className="text-2xl leading-tight">
                {unknownTotal || !canOrder ? "가격 확인 중" : won(total)}
              </strong>
            </p>
            {guidance.kind !== "NONE" && (
              <p className="text-[10px] text-muted">
                예약금은 주문 금액과 별도로 안내돼요.
              </p>
            )}
            {base.agreement.minimumSpend != null && (
              <p className="text-xs text-muted">
                최소 주문 금액 {won(base.agreement.minimumSpend)}
              </p>
            )}
            {base.agreement.minimumQuantity != null && (
              <p className="text-xs text-muted">
                최소 주문 수량 {base.agreement.minimumQuantity}개
              </p>
            )}
            {base.agreement.separateFee != null && (
              <p className="text-xs text-muted">
                별도 이용료 {won(base.agreement.separateFee)}
              </p>
            )}
          </div>
        </section>
        <MenuDeposit guidance={guidance} ready={ready}>
          {canReport && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                이미 송금했다면 입금자명과 송금액을 입력해 주세요.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  id="menu-payer"
                  label="입금자명"
                  labelClassName="text-xs"
                  className="min-w-0"
                  error={form.formState.errors.payer?.message}
                >
                  {(a) => (
                    <Input variant="form" {...a} {...form.register("payer")} />
                  )}
                </FormField>
                <FormField
                  id="menu-amount"
                  label="송금액 (원)"
                  labelClassName="text-xs"
                  className="min-w-0"
                  error={form.formState.errors.amount?.message}
                >
                  {(a) => (
                    <Input
                      variant="form"
                      {...a}
                      type="number"
                      inputMode="numeric"
                      {...form.register("amount")}
                    />
                  )}
                </FormField>
              </div>
            </div>
          )}
        </MenuDeposit>
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <Checkbox
              {...form.register("confirmed")}
              aria-invalid={!!form.formState.errors.confirmed}
              aria-describedby={
                form.formState.errors.confirmed
                  ? "menu-confirmed-error"
                  : undefined
              }
            />
            {canReport
              ? "메뉴 · 예약금 · 변경 조건을 확인했어요."
              : "메뉴와 현재 안내를 확인했어요."}
          </label>
          <FormError
            id="menu-confirmed-error"
            message={form.formState.errors.confirmed?.message}
          />
        </div>
        {changed && !closed && !action.uncertain && (
          <div
            role="alert"
            className="space-y-3 rounded-control bg-choice p-4 text-sm"
          >
            <p>
              {catalogChanged
                ? "메뉴판이 바뀌었어요. 작성한 수량은 유지돼요. 최신 메뉴판을 확인해 주세요."
                : "예약 안내가 바뀌었어요. 작성한 메뉴 수량은 유지돼요."}
            </p>
            {catalogChanged && (
              <ul>
                {q.catalog.menus.map((m) => (
                  <li key={m.id}>
                    {m.name} · {won(m.price)} {!m.available && "품절"}
                  </li>
                ))}
              </ul>
            )}
            <Button
              onClick={() => {
                const old = form.getValues();
                form.reset({
                  ...old,
                  confirmed: false,
                  ...(guidanceChanged ? { payer: "", amount: "" } : {}),
                  items: q.catalog.menus.map((m) => ({
                    id: m.id,
                    quantity:
                      old.items.find((i) => i.id === m.id)?.quantity ?? 0,
                  })),
                });
                setBase(q);
                setCatalogReviewed(true);
                action.reset();
              }}
            >
              {catalogChanged
                ? "최신 메뉴판 확인 · 삭제된 메뉴 제외"
                : "최신 예약 안내 확인"}
            </Button>
          </div>
        )}
        <FormError
          message={action.error ? safeErrorMessage(action.error) : undefined}
        />
        <div className="space-y-2">
          <Button
            type="submit"
            className="min-h-[50px] w-full text-sm"
            disabled={changed || !canOrder}
            loading={action.isPending}
          >
            {canReport && (payer || amount)
              ? "메뉴·송금 정보 보내기"
              : "메뉴 보내기"}
          </Button>
          <Button
            className="min-h-[50px] w-full text-sm"
            variant="outline"
            disabled={changed}
            loading={action.isPending}
            onClick={() => void save(true)}
          >
            메뉴 임시 저장
          </Button>
        </div>
      </fieldset>
      {action.uncertain && (
        <UncertainCommand
          loading={action.isPending}
          onRetry={() => {
            void action
              .retryUncertain()
              .then((result) => {
                if (action.active.current) {
                  setBase({ ...result, catalog: base.catalog });
                  form.reset(form.getValues());
                }
              })
              .catch(() => undefined);
          }}
        />
      )}
    </form>
  );
}
