"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/ui/form-field";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { restaurantsQuery, restaurantQuery } from "../api/restaurants.api";
import type {
  Restaurant,
  RestaurantConditions,
} from "../types/restaurant.types";
import { conditionsMatch } from "../lib/conditions-match";
import { RestaurantPhoto } from "./restaurant-photo";
import { spaceCost } from "../lib/space-cost";
import { RestaurantDetail } from "./restaurant-detail";
import { RestaurantMap } from "./restaurant-map";

const searchSchema = z.object({
  region: z.string().trim().max(80, "지역은 80자 이내로 입력해 주세요."),
});
export function RestaurantBrowser({
  selected,
  restaurantId,
  initialRegion = "",
  conditions,
  onSelect,
  onOpen,
  onInquiry,
  onEditConditions,
}: {
  selected: string[];
  restaurantId: string | null;
  initialRegion?: string;
  conditions?: RestaurantConditions;
  onSelect: (ids: string[]) => void;
  onOpen: (id: string | null) => void;
  onInquiry: (ids: string[]) => void;
  onEditConditions?: () => void;
}) {
  const [mapFocus, setMapFocus] = useState<Restaurant | null>(null);
  const [region, setRegion] = useState(initialRegion);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "map">("list");
  const form = useForm({
    resolver: zodResolver(searchSchema),
    defaultValues: { region: initialRegion },
  });
  const list = useQuery(restaurantsQuery(region, page));
  const mapRestaurants = useMemo(() => {
    const items = list.data?.items ?? [];
    return mapFocus &&
      !items.some((restaurant) => restaurant.id === mapFocus.id)
      ? [...items, mapFocus]
      : items;
  }, [list.data, mapFocus]);
  const chosen = useQueries({ queries: selected.map(restaurantQuery) });
  const unavailable = chosen.some(
    (r) => r.isError || !r.data?.inquiryAvailable,
  );
  const toggle = (id: string) =>
    onSelect(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : selected.length < 3
          ? [...selected, id]
          : selected,
    );
  return (
    <>
      <form
        className="mb-5 flex items-end gap-2"
        onSubmit={form.handleSubmit((values) => {
          setRegion(values.region);
          setPage(1);
        })}
      >
        <FormField
          id="restaurant-region"
          label="희망 지역으로 찾기"
          className="min-w-0 flex-1 text-xs"
          error={form.formState.errors.region?.message}
        >
          {(attributes) => (
            <Input
              {...attributes}
              {...form.register("region")}
              placeholder="건대입구 · 세종대"
              variant="form"
            />
          )}
        </FormField>
        <Button type="submit" variant="brand-outline" className="shrink-0">
          검색
        </Button>
      </form>
      <div className="mb-5 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            목록
          </Button>
          <Button
            variant="outline"
            aria-pressed={view === "map"}
            onClick={() => {
              setMapFocus(null);
              setView("map");
            }}
          >
            지도
          </Button>
        </div>
        {onEditConditions && (
          <Button variant="brand-outline" onClick={onEditConditions}>
            조건 수정
          </Button>
        )}
      </div>
      {list.isError ? (
        <ErrorState retry={() => void list.refetch()}>
          매장 정보를 불러오지 못했어요. 선택은 유지됩니다.
        </ErrorState>
      ) : !list.data ? (
        <LoadingState>매장 불러오는 중…</LoadingState>
      ) : (
        <>
          {!list.data.items.length ? (
            <section className="rounded-control bg-surface px-5 py-10 text-center shadow-card">
              <Image
                src="/images/restaurants/search-empty.svg"
                alt=""
                width={40.7333}
                height={40.733}
                className="mx-auto mb-4"
              />
              <h2 className="text-lg font-bold">조건에 맞는 매장이 없어요</h2>
              <p className="mt-2 mb-6 text-sm text-muted">
                지역을 넓혀 더 많은 매장을 찾아보세요.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  setRegion("");
                  form.setValue("region", "");
                  setPage(1);
                }}
              >
                지역 넓혀서 다시 찾기
              </Button>
            </section>
          ) : (
            <div className="space-y-6">
              {list.data.items.map((r) => {
                const match = conditionsMatch(r, conditions);
                const added = selected.includes(r.id);
                return (
                  <article
                    key={r.id}
                    className="overflow-hidden rounded-control bg-surface shadow-card"
                  >
                    <button
                      className="relative block w-full cursor-pointer text-left"
                      aria-label={`${r.name} 상세 보기`}
                      onClick={() => onOpen(r.id)}
                    >
                      <RestaurantPhoto src={r.photoPath} alt="" height={120} />
                      <span className="absolute top-3 right-3 rounded-pill bg-surface/95 px-2 py-1 text-xs text-secondary shadow-control">
                        {match === "인원·공간 일치" ? "✓ " : "· "}
                        {match}
                      </span>
                    </button>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpen(r.id)}
                          className="min-w-0 text-left text-sm font-semibold wrap-break-word"
                        >
                          {r.name}
                        </button>
                        <Button
                          variant="outline"
                          className="min-h-[44px] shrink-0 rounded-control border-placeholder px-3 text-xs font-normal text-secondary"
                          disabled={
                            !r.inquiryAvailable ||
                            (!added && selected.length === 3)
                          }
                          aria-pressed={added}
                          onClick={() => toggle(r.id)}
                        >
                          {!added && r.inquiryAvailable && (
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
                              : "문의 준비 중"}
                        </Button>
                      </div>
                      <p className="mt-1 text-[10px] text-secondary">
                        {r.maxCapacity === null
                          ? "수용 인원 확인 필요"
                          : `전체 최대 ${r.maxCapacity}명`}{" "}
                        · {r.category ?? "음식 종류 확인 필요"}
                      </p>
                      <p className="mt-1 text-[10px] text-secondary">
                        {r.address}
                      </p>
                      <p className="mt-2 text-[10px] text-muted">
                        매장 정보 기준이며, 해당 날짜의 예약 가능 여부는 문의 후
                        확인합니다.
                      </p>
                      {r.spaces.length ? (
                        r.spaces.map((space) => (
                          <p
                            key={space.id}
                            className="mt-1 text-[10px] text-secondary"
                          >
                            {space.label} ·{" "}
                            {spaceCost("최소 이용금액", space.minSpend)} ·{" "}
                            {spaceCost("별도 대관료", space.separateFee)}
                          </p>
                        ))
                      ) : (
                        <p className="mt-1 text-[10px] text-secondary">
                          최소 이용금액 확인 필요 · 별도 대관료 확인 필요
                        </p>
                      )}
                      {r.isDemo && (
                        <p className="mt-1 text-xs text-brand">
                          가상 매장 · 개발 테스트용
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {list.data.total > list.data.pageSize && (
            <nav
              aria-label="매장 목록 페이지"
              className="mt-5 flex justify-between"
            >
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                이전
              </Button>
              <span>{page}페이지</span>
              <Button
                variant="outline"
                disabled={page * list.data.pageSize >= list.data.total}
                onClick={() => setPage(page + 1)}
              >
                다음
              </Button>
            </nav>
          )}
        </>
      )}
      <section className="mt-7 rounded-control bg-surface p-5 shadow-card">
        <h2 className="mb-3 flex justify-between text-sm font-semibold">
          문의할 매장{" "}
          <span className="rounded border border-brand px-2 py-0.5 text-[10px] font-normal text-brand">
            {selected.length}/3
          </span>
        </h2>
        {!selected.length && (
          <p className="mb-5 text-sm text-muted">
            목록이나 상세에서 1~3곳을 담아주세요.
          </p>
        )}
        <ul className="mb-5 space-y-2">
          {selected.map((id, i) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>{chosen[i]?.data?.name ?? "매장 확인 필요"}</span>
              <IconButton
                className="shrink-0"
                aria-label={`${chosen[i]?.data?.name ?? "매장"} 선택 해제`}
                onClick={() => toggle(id)}
              >
                <Image
                  src="/images/restaurants/remove.svg"
                  alt=""
                  width={13}
                  height={13}
                />
              </IconButton>
            </li>
          ))}
        </ul>
        {unavailable && selected.length > 0 && (
          <p role="status" className="mb-3 text-xs text-danger">
            선택한 매장의 문의 가능 여부를 확인해 주세요. 조회에 실패했다면
            목록을 새로 확인하거나 선택을 해제해 주세요.
          </p>
        )}
        <Button
          className="w-full"
          disabled={!selected.length || unavailable || list.isError}
          onClick={() => onInquiry(selected)}
        >
          선택한 매장에 문의하기
        </Button>
        <p className="mt-3 text-xs text-muted">
          문의 접수 후 운영자가 전달을 준비해요. 아직 문자를 발송하지 않아요.
        </p>
      </section>
      {view === "map" && list.data && (
        <Dialog
          labelledBy="restaurant-map-title"
          onClose={() => setView("list")}
          className="m-auto h-svh max-h-svh w-full max-w-[402px] rounded-none bg-background p-0 text-copy"
        >
          <header className="relative flex h-[103px] items-end justify-center bg-surface px-5 pb-4">
            <IconButton
              aria-label="목록으로 돌아가기"
              onClick={() => setView("list")}
              className="absolute bottom-1.5 left-3"
            >
              <Image
                src="/images/ui/back.svg"
                alt=""
                width={10.4142}
                height={18}
              />
            </IconButton>
            <h2 id="restaurant-map-title" className="text-label">
              매장 지도
            </h2>
          </header>
          <RestaurantMap
            focusId={mapFocus?.id}
            restaurants={mapRestaurants}
            onOpen={(id) => {
              setView("list");
              onOpen(id);
            }}
          />
          <div className="absolute right-[17px] bottom-10 left-[17px]">
            <Button
              variant="brand-outline"
              className="w-full bg-surface"
              onClick={() => setView("list")}
            >
              목록으로 보기
            </Button>
          </div>
        </Dialog>
      )}
      {restaurantId && (
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
          onClose={() => onOpen(null)}
          onSelect={() => toggle(restaurantId)}
          onMap={(restaurant) => {
            setMapFocus(restaurant);
            setView("map");
            onOpen(null);
          }}
          onInquiry={() =>
            onInquiry(
              selected.includes(restaurantId)
                ? selected
                : [...selected, restaurantId],
            )
          }
        />
      )}
    </>
  );
}
