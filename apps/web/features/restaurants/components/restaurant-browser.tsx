"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import {
  restaurantsQuery,
  restaurantQuery,
  restaurantMapQuery,
} from "../api/restaurants.api";
import type { BrowseNavigation } from "../types/restaurant.types";
import { RestaurantPhoto } from "./restaurant-photo";
import { RestaurantDetail } from "./restaurant-detail";
import { RestaurantMap, type MapViewport } from "./restaurant-map";

import { serviceArea } from "@/shared/lib/service-area";
import { cn } from "@/shared/lib/cn";
export function RestaurantBrowser({
  selected,
  restaurantId,
  view,
  page,
  expectedGuests,
  onSelect,
  onNavigate,
  onInquiry,
  onEditConditions,
}: BrowseNavigation & {
  expectedGuests?: number;
  onInquiry: (ids: string[]) => void;
  onEditConditions?: () => void;
}) {
  const [sheet, setSheet] = useState(false);
  const scroll = useRef(0);
  const viewport = useRef<MapViewport | null>(null);
  const focusedViewport = useRef<MapViewport | null>(null);
  const list = useQuery({
    ...restaurantsQuery(serviceArea.search, page, expectedGuests),
    enabled: view === "list",
  });
  const map = useQuery({
    ...restaurantMapQuery(serviceArea.search, expectedGuests),
    enabled: view === "map" && !restaurantId,
  });
  const focus = useQuery({
    ...restaurantQuery(restaurantId ?? ""),
    enabled: view === "map" && !!restaurantId,
  });
  const chosen = useQueries({ queries: selected.map(restaurantQuery) });
  const loading = chosen.some((r) => r.isPending);
  const failed = chosen.some((r) => r.isError);
  const unavailable = chosen.some((r) => r.data && !r.data.inquiryAvailable);
  const toggle = (id: string) =>
    onSelect(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : selected.length < 3
          ? [...selected, id]
          : selected,
    );
  useEffect(() => {
    if (view !== "list") return;
    const frame = requestAnimationFrame(() =>
      window.scrollTo(0, scroll.current),
    );
    const remember = () => {
      scroll.current = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
    };
  }, [view]);
  const open = (id: string) => onNavigate({ view: "detail", restaurant: id });
  const locationQuery = restaurantId ? focus : map;
  const points = restaurantId
    ? focus.data
      ? [focus.data]
      : []
    : (map.data ?? []);
  return (
    <>
      {view === "detail" && restaurantId ? (
        <RestaurantDetail
          key={restaurantId}
          id={restaurantId}
          selected={selected.includes(restaurantId)}
          full={selected.length === 3}
          targetCount={
            selected.includes(restaurantId)
              ? selected.length
              : selected.length + 1
          }
          onSelect={() => toggle(restaurantId)}
          onMap={(r) => {
            focusedViewport.current = null;
            onNavigate({ view: "map", restaurant: r.id });
          }}
          onInquiry={() =>
            onInquiry(
              selected.includes(restaurantId)
                ? selected
                : [...selected, restaurantId],
            )
          }
        />
      ) : view === "map" ? (
        <>
          {locationQuery.isError && (
            <ErrorState retry={() => void locationQuery.refetch()}>
              지도를 다시 불러와 주세요.
            </ErrorState>
          )}
          {!locationQuery.data ? (
            !locationQuery.isError && (
              <LoadingState>매장 위치 불러오는 중…</LoadingState>
            )
          ) : (
            <RestaurantMap
              key={restaurantId ?? "area"}
              restaurants={points}
              focusId={restaurantId}
              viewport={restaurantId ? focusedViewport : viewport}
              onOpen={open}
            />
          )}
          {restaurantId && (
            <Button
              className="my-4 w-full"
              onClick={() => onNavigate({ view: "map", restaurant: null })}
            >
              이 지역 매장 보기
            </Button>
          )}
        </>
      ) : (
        <>
          {list.isError && (
            <ErrorState retry={() => void list.refetch()}>
              매장을 불러오지 못했어요.
            </ErrorState>
          )}
          {!list.data ? (
            !list.isError && <LoadingState>매장 불러오는 중…</LoadingState>
          ) : (
            <>
              {!list.data.items.length ? (
                <section className="rounded-control bg-surface px-5 pt-12 pb-7 text-center shadow-card">
                  <Image
                    src="/images/restaurants/search-empty.svg"
                    alt=""
                    width={41}
                    height={41}
                    loading="eager"
                    className="mx-auto mb-3"
                  />
                  <h2 className="text-lg font-bold">
                    {onEditConditions
                      ? "조건에 맞는 매장이 없어요"
                      : "이 지역에 등록된 매장이 없어요"}
                  </h2>
                  {onEditConditions && (
                    <>
                      <p className="mx-auto mt-2 max-w-[235px] text-xs text-muted">
                        {serviceArea.label}에서 예상 인원을 조정해 다시
                        찾아보세요.
                      </p>
                      <Button
                        className="mt-5 w-full"
                        onClick={onEditConditions}
                      >
                        조건 넓혀서 다시 찾기
                      </Button>
                    </>
                  )}
                </section>
              ) : (
                <div
                  className={cn(
                    "pb-28",
                    onEditConditions ? "space-y-7" : "space-y-5",
                  )}
                >
                  {list.data.items.map((r, index) => {
                    const added = selected.includes(r.id);
                    const facts = [
                      r.maxCapacity !== null ? `최대 ${r.maxCapacity}명` : null,
                      ...new Set(
                        r.spaces
                          .filter((s) => s.availability === "AVAILABLE")
                          .map(
                            (s) =>
                              ({
                                HALL: "홀",
                                FLOOR: "층 대관",
                                WHOLE: "전체 대관",
                                ROOM: "룸",
                              })[s.kind],
                          ),
                      ),
                      r.category,
                    ].filter(Boolean);
                    return (
                      <article
                        key={r.id}
                        className="rounded-control bg-surface shadow-card"
                      >
                        <button
                          className="relative block w-full cursor-pointer overflow-hidden rounded-t-control text-left"
                          aria-label={`${r.name} 상세 보기`}
                          onClick={() => open(r.id)}
                        >
                          <RestaurantPhoto
                            src={r.photoPath}
                            alt=""
                            height={onEditConditions ? 122 : 150}
                            eager={index === 0}
                          />
                          {onEditConditions && (
                            <span
                              className={cn(
                                "absolute top-3 right-4 rounded-pill px-3 py-1.5 text-sm font-medium",
                                r.inquiryAvailable
                                  ? "bg-accent text-brand-ink"
                                  : "bg-choice text-copy",
                              )}
                            >
                              {r.inquiryAvailable ? "문의 가능" : "문의 불가"}
                            </span>
                          )}
                        </button>
                        <div className={onEditConditions ? "px-4 py-3" : "p-4"}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                onClick={() => open(r.id)}
                                className="text-left text-base font-semibold wrap-break-word"
                              >
                                {r.name}
                              </button>
                              {facts.length > 0 && (
                                <p className="mt-1 text-xs text-secondary">
                                  {facts.join(" · ")}
                                </p>
                              )}
                            </div>
                            <Button
                              variant={added ? "brand-outline" : "outline"}
                              className={cn(
                                "shrink-0 px-3 text-xs",
                                onEditConditions && "rounded-control",
                              )}
                              disabled={
                                !added &&
                                (!r.inquiryAvailable || selected.length === 3)
                              }
                              aria-pressed={added}
                              onClick={() => toggle(r.id)}
                            >
                              {onEditConditions &&
                                !added &&
                                r.inquiryAvailable && (
                                  <Image
                                    src="/images/restaurants/add.svg"
                                    alt=""
                                    width={13}
                                    height={13}
                                  />
                                )}
                              {added
                                ? "담기 취소"
                                : r.inquiryAvailable
                                  ? "문의 담기"
                                  : "문의 불가"}
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {list.data.total > list.data.pageSize && (
                <nav
                  aria-label="매장 목록 페이지"
                  className="my-5 flex justify-between pb-24"
                >
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => onNavigate({ page: String(page - 1) })}
                  >
                    이전
                  </Button>
                  <span>{page}페이지</span>
                  <Button
                    variant="outline"
                    disabled={page * list.data.pageSize >= list.data.total}
                    onClick={() => onNavigate({ page: String(page + 1) })}
                  >
                    다음
                  </Button>
                </nav>
              )}
            </>
          )}
        </>
      )}
      {view === "list" && selected.length > 0 && (
        <aside
          aria-label="선택한 매장"
          className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[402px] -translate-x-1/2 items-center gap-3 border-t border-border bg-surface px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-card"
        >
          <button
            className="min-h-12 flex-1 text-left text-sm font-semibold"
            onClick={() => setSheet(true)}
          >
            선택한 매장 {selected.length}/3 <span aria-hidden>⌃</span>
          </button>
          <Button
            className="shrink-0 text-sm"
            disabled={loading || failed || unavailable}
            onClick={() => onInquiry(selected)}
          >
            문의 조건 확인
          </Button>
        </aside>
      )}
      {sheet && (
        <BottomSheet
          title={
            onEditConditions
              ? "문의할 매장"
              : `선택한 매장 ${selected.length}/3`
          }
          onClose={() => setSheet(false)}
          footer={
            <Button
              className="w-full"
              disabled={!selected.length || loading || failed || unavailable}
              onClick={() => {
                setSheet(false);
                onInquiry(selected);
              }}
            >
              {onEditConditions ? "보낼 내용 확인하기" : "선택한 매장으로 계속"}
            </Button>
          }
        >
          {onEditConditions && (
            <p className="mb-2 text-right text-xs font-medium text-secondary">
              <span className="sr-only">3곳 중 {selected.length}곳 선택</span>
              <span
                aria-hidden="true"
                className="rounded border border-field px-2 py-0.5"
              >
                {selected.length}/3
              </span>
            </p>
          )}
          {!selected.length && (
            <p className="py-5 text-sm text-muted">선택한 매장이 없어요.</p>
          )}
          <ul className="divide-y divide-border">
            {selected.map((id, i) => (
              <li key={id} className="flex items-center gap-3 py-4">
                <div className="flex-1">
                  <strong className="text-sm">
                    {chosen[i]?.data?.name ??
                      (chosen[i]?.isError ? "매장 조회 실패" : "매장 확인 중…")}
                  </strong>
                  <p className="mt-1 text-xs text-muted">
                    {chosen[i]?.data?.address}
                  </p>
                  {chosen[i]?.data && !chosen[i].data.inquiryAvailable && (
                    <p className="mt-1 text-xs text-danger">
                      현재 문의할 수 없는 매장이에요.
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  className={
                    onEditConditions
                      ? "size-control border-transparent px-0"
                      : undefined
                  }
                  aria-label={`${chosen[i]?.data?.name ?? "매장"} 선택 해제`}
                  onClick={() => toggle(id)}
                >
                  {onEditConditions ? (
                    <Image
                      src="/images/restaurants/remove.svg"
                      alt=""
                      width={13}
                      height={13}
                    />
                  ) : (
                    "제거"
                  )}
                </Button>
              </li>
            ))}
          </ul>
          {failed && (
            <ErrorState
              retry={() =>
                chosen.forEach((r) => {
                  if (r.isError) void r.refetch();
                })
              }
            >
              선택한 매장을 다시 확인해 주세요.
            </ErrorState>
          )}
        </BottomSheet>
      )}
    </>
  );
}
