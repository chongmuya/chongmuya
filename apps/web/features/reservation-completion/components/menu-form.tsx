"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useCompletionCommand } from "../hooks/use-completion-command";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { won } from "./completion-summary";
const schema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      quantity: z
        .number({ error: "수량을 입력해 주세요." })
        .int("수량은 정수로 입력해 주세요.")
        .min(0, "수량은 0 이상이어야 해요.")
        .max(100000, "수량은 100,000 이하여야 해요."),
    }),
  ),
  confirmed: z.boolean(),
  payer: z.string().trim().max(80),
  amount: z.string().trim(),
});
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
      resolver: zodResolver(schema),
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
  const changed =
    !catalogReviewed ||
    q.version !== base.version ||
    q.catalog.version !== base.catalog.version;
  const unknownTotal = items.some(
    (i) =>
      i.quantity > 0 &&
      base.catalog.menus.find((m) => m.id === i.id)?.price == null,
  );
  const total = items.reduce((sum, i) => {
    const menu = base.catalog.menus.find((m) => m.id === i.id);
    return sum + (menu?.price ?? 0) * (i.quantity || 0);
  }, 0);
  const ready =
    base.guidance.kind === "NONE" ||
    (base.guidance.kind === "REQUIRED" &&
      base.guidance.channel !== "PENDING" &&
      !!base.guidance.deadline);
  async function save(draft: boolean) {
    await form.handleSubmit(async (values) => {
      if (changed || action.isPending) return;
      if (!draft && !values.confirmed) {
        form.setError("confirmed", {
          message: "메뉴·예약금·변경 조건을 확인해 주세요.",
        });
        return;
      }
      const transfer =
        values.payer || values.amount
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
        if (action.active.current)
          setBase({ ...result, catalog: base.catalog });
      } catch {
        /* Input and command identity survive explicit retries. */
      }
    })();
  }
  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <section className="rounded-control bg-surface p-5 shadow-card">
        <h3 className="mb-3 font-semibold">메뉴 선택</h3>
        <p className="mb-3 text-xs text-muted">
          {form.formState.isDirty
            ? "저장하지 않은 수량 변경이 있어요."
            : q.draft
              ? "임시 저장한 수량을 불러왔어요."
              : "수량을 선택하고 임시 저장하거나 전달해 주세요."}
        </p>
        {!base.catalog.menus.length && (
          <p className="text-sm">
            등록된 메뉴가 없어요. 매장에 메뉴 등록을 요청해 주세요. 임의 메뉴로
            완료할 수 없어요.
          </p>
        )}
        <div className="divide-y divide-border">
          {base.catalog.menus.map((m, index) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <strong className="text-sm">{m.name}</strong>
                <p className="text-xs text-muted">{m.unit}</p>
                <p className="text-sm font-semibold">
                  {m.price === null ? "가격 확인 필요" : won(m.price)}
                  {!m.available ? " · 품절" : ""}
                </p>
              </div>
              <div className="flex max-w-full items-center gap-2">
                <Button
                  variant="outline"
                  aria-label={`${m.name} 수량 줄이기`}
                  disabled={
                    !m.available || m.price === null || action.isPending
                  }
                  onClick={() =>
                    form.setValue(
                      `items.${index}.quantity`,
                      Math.max(0, (items[index]?.quantity || 0) - 1),
                      { shouldDirty: true },
                    )
                  }
                >
                  −
                </Button>
                <FormField
                  id={`menu-${m.id}`}
                  label={`${m.name} 수량`}
                  labelClassName="sr-only"
                  error={
                    form.formState.errors.items?.[index]?.quantity?.message
                  }
                >
                  {(attrs) => (
                    <Input
                      {...attrs}
                      className="w-16 text-center"
                      type="number"
                      min={0}
                      max={100000}
                      disabled={
                        !m.available || m.price === null || action.isPending
                      }
                      {...form.register(`items.${index}.quantity`, {
                        valueAsNumber: true,
                      })}
                    />
                  )}
                </FormField>
                <Button
                  variant="outline"
                  aria-label={`${m.name} 수량 늘리기`}
                  disabled={
                    !m.available || m.price === null || action.isPending
                  }
                  onClick={() =>
                    form.setValue(
                      `items.${index}.quantity`,
                      Math.min(100000, (items[index]?.quantity || 0) + 1),
                      { shouldDirty: true },
                    )
                  }
                >
                  +
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex justify-between gap-3 text-sm">
          메뉴 주문 금액{" "}
          <strong className="text-2xl">
            {unknownTotal ? "가격 확인 필요" : won(total)}
          </strong>
        </p>
        <p className="mt-2 text-xs text-muted">
          예약금은 별도 안내예요. 최소 주문 {won(base.agreement.minimumSpend)} ·
          최소 수량 {base.agreement.minimumQuantity ?? "미확인"} · 별도 이용료{" "}
          {won(base.agreement.separateFee)}
        </p>
      </section>
      {base.guidance.kind === "REQUIRED" && (
        <section className="space-y-4 rounded-control bg-surface p-5 shadow-card">
          <h3 className="font-semibold">송금 사실 함께 신고 (선택)</h3>
          <p className="text-xs text-muted">
            이미 송금했다면 작성해 주세요. 실제 은행 입금 확인은 사장님이 별도로
            진행해요.
          </p>
          <FormField
            id="menu-payer"
            label="입금자명"
            error={form.formState.errors.payer?.message}
          >
            {(a) => <Input {...a} {...form.register("payer")} />}
          </FormField>
          <FormField
            id="menu-amount"
            label="신고 금액 (원)"
            error={form.formState.errors.amount?.message}
          >
            {(a) => <Input {...a} type="number" {...form.register("amount")} />}
          </FormField>
        </section>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-5"
          {...form.register("confirmed")}
          aria-invalid={!!form.formState.errors.confirmed}
          aria-describedby="menu-confirmed-error"
        />
        메뉴·예약금·변경 조건을 확인했어요.
      </label>
      <FormError
        id="menu-confirmed-error"
        message={form.formState.errors.confirmed?.message}
      />
      {changed && (
        <div
          role="alert"
          className="space-y-3 rounded-control bg-choice p-4 text-sm"
        >
          <p>
            최신 예약·메뉴판이 바뀌었어요. 작성한 수량은 유지돼요. 아래 새
            가격·품절·삭제 내역을 확인해 주세요.
          </p>
          <ul>
            {q.catalog.menus.map((m) => (
              <li key={m.id}>
                {m.name} · {won(m.price)} {!m.available && "품절"}
              </li>
            ))}
          </ul>
          <Button
            onClick={() => {
              const old = form.getValues();
              form.reset({
                ...old,
                confirmed: false,
                items: q.catalog.menus.map((m) => ({
                  id: m.id,
                  quantity: old.items.find((i) => i.id === m.id)?.quantity ?? 0,
                })),
              });
              setBase(q);
              setCatalogReviewed(true);
              action.reset();
            }}
          >
            최신 메뉴판 확인 · 삭제된 메뉴 제외
          </Button>
        </div>
      )}
      <FormError
        message={action.error ? safeErrorMessage(action.error) : undefined}
      />
      <Button
        className="w-full"
        variant="outline"
        disabled={changed}
        loading={action.isPending}
        onClick={() => void save(true)}
      >
        메뉴 임시 저장
      </Button>
      <Button
        type="submit"
        className="w-full"
        disabled={
          changed ||
          !ready ||
          !base.catalog.menus.some((m) => m.available && m.price !== null)
        }
        loading={action.isPending}
      >
        메뉴·송금 정보 보내기
      </Button>
      {!ready && (
        <p className="text-sm text-muted">
          예약금 안내 준비가 끝나면 메뉴를 전달할 수 있어요.
        </p>
      )}
    </form>
  );
}
