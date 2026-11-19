"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/client";
import { useGroups } from "@/features/groups/client";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { isAccessError } from "@/shared/http/access-error";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { StepLayout } from "@/shared/ui/step-layout";
import {
  favoritesQuery,
  favoritesKey,
  saveFavorite,
} from "../api/favorites.api";
import type { SessionRequest } from "@/features/auth/types";
export function Favorites({ restaurantId }: { restaurantId?: string }) {
  const { account, client } = useAuth();
  const request = useMemo(() => client.request.bind(client), [client]);
  return account ? (
    <Context
      key={account.id}
      accountId={account.id}
      request={request}
      restaurantId={restaurantId}
    />
  ) : (
    <Link href="/start?next=%2Ffavorites">로그인하고 즐겨찾기 이용하기</Link>
  );
}
function Context({
  accountId,
  request,
  restaurantId,
}: {
  accountId: string;
  request: SessionRequest;
  restaurantId?: string;
}) {
  const [groupId, setGroupId] = useState("");
  const groups = useGroups(accountId, request);
  return (
    <section className="space-y-3" aria-label="매장 즐겨찾기">
      <label htmlFor="favorite-context">즐겨찾기 저장 위치</label>
      <select
        id="favorite-context"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className="h-12 w-full rounded-control border border-border px-3"
      >
        <option value="">개인 즐겨찾기</option>
        {groups.data?.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {groups.isError && (
        <ErrorState retry={() => void groups.refetch()}>
          모임을 확인하지 못했어요. 개인 즐겨찾기는 이용할 수 있어요.
        </ErrorState>
      )}
      <List
        key={`${accountId}:${groupId}`}
        {...{ accountId, request, groupId, restaurantId }}
      />
    </section>
  );
}
function List({
  accountId,
  request,
  restaurantId,
  groupId,
}: {
  accountId: string;
  request: SessionRequest;
  restaurantId?: string;
  groupId: string;
}) {
  const active = useActiveScreen(),
    cache = useQueryClient();
  const q = useQuery(favoritesQuery(request, accountId, groupId));
  const save = useMutation({
    mutationFn: (v: { id: string; saved: boolean }) =>
      saveFavorite(request, v.id, groupId, v.saved),
    retry: false,
    networkMode: "always",
    onSuccess: () => {
      if (active.current)
        void cache.invalidateQueries({
          queryKey: favoritesKey(accountId, groupId),
        });
    },
  });
  if (isAccessError(q.error))
    return (
      <ErrorState
        retry={() => location.assign(new URL("/mypage", location.origin).href)}
      >
        즐겨찾기 관리 권한이 없어요.
      </ErrorState>
    );
  if (!q.data)
    return q.isError ? (
      <ErrorState retry={() => void q.refetch()} />
    ) : (
      <LoadingState>확인 중…</LoadingState>
    );
  const saved = q.data.some((f) => f.restaurantId === restaurantId);
  return (
    <>
      {restaurantId ? (
        <>
          <Button
            variant="brand-outline"
            disabled={save.isPending || q.isError}
            aria-pressed={saved}
            onClick={() => save.mutate({ id: restaurantId, saved: !saved })}
          >
            {saved ? "즐겨찾기 해제" : "즐겨찾기 저장"}
          </Button>
          <Link className="ml-3 underline" href="/favorites">
            저장한 매장 보기
          </Link>
        </>
      ) : q.data.length ? (
        <ul className="divide-y divide-border">
          {q.data.map((f) => (
            <li key={f.id} className="space-y-2 py-4">
              <p className="font-semibold">
                {f.restaurant?.name ?? "비공개 또는 삭제된 매장"}
              </p>
              {f.restaurant && (
                <Link
                  href={`/restaurants?restaurant=${f.restaurantId}&view=detail`}
                >
                  매장 상세 보기
                </Link>
              )}
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({ id: f.restaurantId, saved: false })
                }
              >
                저장 해제
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          저장한 매장이 없어요. <Link href="/restaurants">매장 둘러보기</Link>
        </p>
      )}
      {save.isError && (
        <ErrorState retry={() => save.variables && save.mutate(save.variables)}>
          저장 결과를 확인하지 못했어요. 같은 선택으로 다시 확인해 주세요.
        </ErrorState>
      )}
      {q.isError && <ErrorState retry={() => void q.refetch()} />}
    </>
  );
}
export function FavoritesScreen() {
  return (
    <StepLayout
      title="매장 즐겨찾기"
      variant="flow"
      onBack={() => location.assign(new URL("/mypage", location.origin).href)}
    >
      <Favorites />
    </StepLayout>
  );
}
