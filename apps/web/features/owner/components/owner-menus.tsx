"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { Account, SessionRequest } from "@/features/auth/types";
import { StepLayout } from "@/shared/ui/step-layout";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { menuInputSchema } from "../schemas/registration.schema";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ownerQuery } from "../api/owner.api";
import { useOwnerAction } from "../hooks/use-owner-action";
import { OwnerCheck } from "./owner-fields";
type Menu = z.infer<typeof menuInputSchema>;
const empty: Menu = {
  name: "",
  kind: "REGULAR",
  price: null,
  unit: "",
  available: true,
  position: 0,
};
export function OwnerMenus({
  account,
  request,
  restaurantId,
  onNavigate,
}: {
  account: Account;
  request: SessionRequest;
  restaurantId?: string;
  onNavigate: (path: string) => void;
}) {
  const result = useQuery({
    ...ownerQuery<{ version: number; menus: Menu[] }>(
      account.id,
      `restaurants/${restaurantId}/menus`,
      request,
    ),
    enabled: !!restaurantId,
  });
  const form = useForm<Menu>({
    resolver: zodResolver(menuInputSchema),
    defaultValues: empty,
  });
  const save = useOwnerAction<{ version: number }>(account.id, request);
  const active = useActiveScreen();
  return (
    <StepLayout title="메뉴 관리" onBack={() => onNavigate("/owner")}>
      {!restaurantId ? (
        <Link href="/owner">내 매장을 먼저 선택해 주세요.</Link>
      ) : result.isError ? (
        <ErrorState retry={() => void result.refetch()} />
      ) : !result.data ? (
        <LoadingState>메뉴 불러오는 중…</LoadingState>
      ) : (
        <>
          <h1 className="mb-5 text-2xl font-bold">메뉴 등록·수정</h1>
          <p className="mb-5 text-sm text-muted">
            가격이 미확인이면 비워 두세요. 판매 중단해도 기존 메뉴 기록은
            유지됩니다.
          </p>
          <ul className="mb-6 space-y-2">
            {result.data.menus.map((m) => (
              <li
                key={m.id}
                className="rounded-control bg-surface p-4 shadow-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {m.name} ·{" "}
                    {m.price === null
                      ? "가격 확인 필요"
                      : `${m.price.toLocaleString()}원`}
                    <small className="block text-muted">
                      {m.available ? "판매 중" : "판매 중단"} · {m.unit}
                    </small>
                  </span>
                  <Button variant="outline" onClick={() => form.reset(m)}>
                    수정
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (menu) => {
              await save
                .mutateAsync({
                  path: `restaurants/${restaurantId}/menus`,
                  method: "PUT",
                  body: { version: result.data!.version, menu },
                })
                .then(() => {
                  if (active.current) form.reset(empty);
                })
                .catch(() => undefined);
            })}
          >
            <label className="block space-y-2">
              메뉴명
              <Input {...form.register("name")} />
            </label>
            <label className="block space-y-2">
              메뉴 종류
              <Select {...form.register("kind")}>
                <option value="REGULAR">일반 메뉴</option>
                <option value="SET">세트</option>
              </Select>
            </label>
            <Controller
              name="price"
              control={form.control}
              render={({ field }) => (
                <label className="block space-y-2">
                  가격 (원)
                  <Input
                    type="number"
                    min={0}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    placeholder="가격 미확인"
                  />
                </label>
              )}
            />
            <label className="block space-y-2">
              수량 단위
              <Input
                {...form.register("unit")}
                placeholder="예: 1인분, 1세트"
              />
            </label>
            <label className="block space-y-2">
              표시 순서
              <Input
                type="number"
                min={0}
                {...form.register("position", { valueAsNumber: true })}
              />
            </label>
            <OwnerCheck {...form.register("available")}>판매 중</OwnerCheck>
            {Object.keys(form.formState.errors).length > 0 && (
              <FormError message="메뉴명·단위·가격·순서를 확인해 주세요." />
            )}
            <FormError
              message={save.error ? safeErrorMessage(save.error) : undefined}
            />
            <Button type="submit" className="w-full" loading={save.isPending}>
              메뉴 저장
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => form.reset(empty)}
            >
              새 메뉴 입력
            </Button>
          </form>
        </>
      )}
    </StepLayout>
  );
}
