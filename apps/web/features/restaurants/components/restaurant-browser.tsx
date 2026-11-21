"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import {
  restaurantsQuery,
  restaurantQuery,
  restaurantMapQuery,
} from "../api/restaurants.api";
import type { BrowseNavigation } from "../types/restaurant.types";
import {
  restaurantInquiryIssue,
  useSelectedRestaurants,
} from "../hooks/use-restaurants";
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
  inquirySheet,
}: BrowseNavigation & {
  expectedGuests?: number;
  onInquiry?: (ids: string[]) => void;
  onEditConditions?: () => void;
  inquirySheet?: {
    summary: ReactNode;
    notice?: ReactNode;
    error?: string;
    disabled: boolean;
    sending: boolean;
    onSubmit: () => void;
  };
}) {
  const [sheet, setSheet] = useState(false);
  const listFocus = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sendsInquiry = inquirySheet !== undefined;
  const sending = inquirySheet?.sending ?? false;
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
  const chosen = useSelectedRestaurants(selected);
  const issues = chosen.map((result) =>
    restaurantInquiryIssue(result, expectedGuests),
  );
  const selectionBlocked = issues.some(Boolean);
  const toggle = (id: string) => {
    if (sending) return;
    if (sheet && view === "list" && selected.length === 1 && selected[0] === id)
      returnFocus.current = listFocus.current;
    onSelect(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : selected.length < 3
          ? [...selected, id]
          : selected,
    );
  };
  // Back dismisses the sheet before it moves between browse screens.
  const pushSheetEntry = () =>
    window.history.pushState(
      {
        restaurantNavigation:
          window.history.state?.restaurantNavigation === true,
        restaurantInquirySheet: true,
      },
      "",
      window.location.href,
    );
  useEffect(() => {
    if (!sheet || !sendsInquiry) return;
    const onBack = (event: PopStateEvent) => {
      if (event.state?.restaurantInquirySheet) return;
      if (sending) pushSheetEntry();
      else setSheet(false);
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [sheet, sendsInquiry, sending]);
  useEffect(() => {
    if (
      !sheet &&
      listFocus.current &&
      returnFocus.current === listFocus.current
    )
      listFocus.current.focus({ preventScroll: true });
  }, [sheet]);
  const openSheet = (trigger: HTMLElement, ids = selected) => {
    if (sheet) return;
    returnFocus.current = trigger;
    if (sendsInquiry && !window.history.state?.restaurantInquirySheet)
      pushSheetEntry();
    if (ids !== selected) onSelect(ids);
    setSheet(true);
  };
  const closeSheet = () => {
    if (sending) return;
    if (sendsInquiry && window.history.state?.restaurantInquirySheet)
      window.history.back();
    else setSheet(false);
  };
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
          selectionBlocked={selectionBlocked}
          opensInquirySheet={sendsInquiry}
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
          onInquiry={(trigger) => {
            const added = selected.includes(restaurantId);
            if (!added && selected.length >= 3) return;
            const ids = added ? selected : [...selected, restaurantId];
            if (sendsInquiry) openSheet(trigger, ids);
            else onInquiry?.(ids);
          }}
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
        <div ref={listFocus} tabIndex={-1} className="focus:outline-none">
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
                    onClick={() =>
                      onNavigate(
                        { page: String(page - 1) },
                        { replace: sendsInquiry },
                      )
                    }
                  >
                    이전
                  </Button>
                  <span>{page}페이지</span>
                  <Button
                    variant="outline"
                    disabled={page * list.data.pageSize >= list.data.total}
                    onClick={() =>
                      onNavigate(
                        { page: String(page + 1) },
                        { replace: sendsInquiry },
                      )
                    }
                  >
                    다음
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      )}
      {view === "list" && selected.length > 0 && (
        <aside
          aria-label="선택한 매장"
          className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[402px] -translate-x-1/2 items-center gap-3 border-t border-border bg-surface px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-card"
        >
          <button
            className="min-h-12 flex-1 text-left text-sm font-semibold"
            onClick={(event) => openSheet(event.currentTarget)}
          >
            선택한 매장 {selected.length}/3 <span aria-hidden>⌃</span>
          </button>
          <Button
            className="shrink-0 text-sm"
            disabled={!sendsInquiry && selectionBlocked}
            onClick={(event) => {
              if (sendsInquiry) openSheet(event.currentTarget);
              else onInquiry?.(selected);
            }}
          >
            {sendsInquiry ? "문의 진행하기" : "문의 조건 확인"}
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
          onClose={closeSheet}
          busy={sending}
          returnFocusRef={returnFocus}
          headerAction={
            onEditConditions && (
              <p className="ml-auto text-xs font-medium text-brand">
                <span className="sr-only">3곳 중 {selected.length}곳 선택</span>
                <span
                  aria-hidden="true"
                  className="rounded border border-brand px-2 py-0.5"
                >
                  {selected.length}/3
                </span>
              </p>
            )
          }
          footer={
            <Button
              className="w-full"
              disabled={
                !selected.length || selectionBlocked || inquirySheet?.disabled
              }
              loading={sending}
              onClick={() => {
                if (inquirySheet) inquirySheet.onSubmit();
                else {
                  closeSheet();
                  onInquiry?.(selected);
                }
              }}
            >
              {sending
                ? "문의 보내는 중…"
                : inquirySheet
                  ? `${selected.length}곳에 문의 보내기`
                  : onEditConditions
                    ? "보낼 내용 확인하기"
                    : "선택한 매장으로 계속"}
            </Button>
          }
        >
          {inquirySheet?.summary}
          {inquirySheet?.notice}
          {!selected.length && (
            <p className="py-5 text-sm text-muted">선택한 매장이 없어요.</p>
          )}
          <ul className="divide-y divide-border">
            {selected.map((id, i) => (
              <li key={id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1 wrap-break-word">
                  <strong className="text-base font-medium">
                    {chosen[i]?.data?.name ??
                      (chosen[i]?.isError ? "매장 조회 실패" : "매장 확인 중…")}
                  </strong>
                  {!sendsInquiry && (
                    <p className="mt-1 text-xs text-muted">
                      {chosen[i]?.data?.address}
                    </p>
                  )}
                  {issues[i] === "loading" && chosen[i]?.data && (
                    <p role="status" className="mt-1 text-xs text-muted">
                      최신 매장 정보 확인 중…
                    </p>
                  )}
                  {issues[i] === "unavailable" && (
                    <p className="mt-1 text-xs text-danger">
                      현재 문의할 수 없는 매장이에요.
                    </p>
                  )}
                  {issues[i] === "capacity" && (
                    <p className="mt-1 text-xs text-danger">
                      {chosen[i]?.data?.maxCapacity == null
                        ? "최대 수용 인원을 확인할 수 없어요."
                        : `최대 ${chosen[i].data.maxCapacity}명까지 가능해요.`}
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
                  disabled={sending}
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
          {issues.includes("error") && (
            <ErrorState
              retry={() =>
                chosen.forEach((r, index) => {
                  if (!sending && issues[index] === "error")
                    void r.refetch({ cancelRefetch: false });
                })
              }
            >
              선택한 매장을 다시 확인해 주세요.
            </ErrorState>
          )}
          <FormError message={inquirySheet?.error} className="break-keep" />
          {sendsInquiry && chosen.some((r) => r.data?.isDemo) && (
            <p className="mt-2 text-xs text-secondary">
              체험 매장에는 실제 문자가 발송되지 않아요.
            </p>
          )}
        </BottomSheet>
      )}
    </>
  );
}
