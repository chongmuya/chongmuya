"use client";
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
                <section className="rounded-control bg-surface px-5 py-10 text-center">
                  <h2 className="text-lg font-bold">
                    {expectedGuests
                      ? `이 지역에 ${expectedGuests}명 규모의 매장이 없어요`
                      : "이 지역에 등록된 매장이 없어요"}
                  </h2>
                  {onEditConditions && (
                    <Button className="mt-6 w-full" onClick={onEditConditions}>
                      문의 조건 수정
                    </Button>
                  )}
                </section>
              ) : (
                <div className="space-y-5 pb-28">
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
                            height={150}
                            eager={index === 0}
                          />
                        </button>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                onClick={() => open(r.id)}
                                className="text-left text-base font-semibold wrap-break-word"
                              >
                                {r.name}
                              </button>
                              {facts.length > 0 && (
                                <p className="mt-2 text-xs text-secondary">
                                  {facts.join(" · ")}
                                </p>
                              )}
                            </div>
                            <Button
                              variant={added ? "brand-outline" : "outline"}
                              className="shrink-0 px-3 text-xs"
                              disabled={
                                !added &&
                                (!r.inquiryAvailable || selected.length === 3)
                              }
                              aria-pressed={added}
                              onClick={() => toggle(r.id)}
                            >
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
          title={`선택한 매장 ${selected.length}/3`}
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
              선택한 매장으로 계속
            </Button>
          }
        >
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
                  aria-label={`${chosen[i]?.data?.name ?? "매장"} 선택 해제`}
                  onClick={() => toggle(id)}
                >
                  제거
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
