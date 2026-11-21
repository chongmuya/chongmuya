"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { restaurantQuery } from "../api/restaurants.api";
import { restaurantInquiryIssue } from "../hooks/use-restaurants";
import type { Restaurant } from "../types/restaurant.types";
import { RestaurantPhoto } from "./restaurant-photo";
import {
  RestaurantInfoSheet,
  type RestaurantInfoSection,
} from "./restaurant-info-sheet";

const infoActions = [
  {
    section: "booking",
    label: "예약 정보",
    icon: "booking",
    width: 23.4,
    height: 19.8,
  },
  {
    section: "spaces",
    label: "공간 정보",
    icon: "space",
    width: 19.062,
    height: 17.5,
  },
  {
    section: "menus",
    label: "메뉴판",
    icon: "menu",
    width: 15.5,
    height: 20.5,
  },
] as const;

export function RestaurantDetail({
  id,
  selected,
  full,
  selectionBlocked,
  opensInquirySheet,
  expectedGuests,
  targetCount,
  onSelect,
  onInquiry,
  onMap,
}: {
  id: string;
  selected: boolean;
  full: boolean;
  selectionBlocked: boolean;
  opensInquirySheet: boolean;
  expectedGuests?: number;
  targetCount: number;
  onSelect: () => void;
  onInquiry: (trigger: HTMLButtonElement) => void;
  onMap: (restaurant: Restaurant) => void;
}) {
  const result = useQuery(restaurantQuery(id));
  const [section, setSection] = useState<RestaurantInfoSection | null>(null);
  const infoTrigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const retryFocused = useRef(false);
  const unavailableNotice = useRef<HTMLParagraphElement>(null);
  const r = result.data;
  const spacePhoto = r?.spacePhotos[0];
  const inquiryIssue = restaurantInquiryIssue(result, expectedGuests);
  const retry = () => {
    if (!result.isFetching) void result.refetch({ cancelRefetch: false });
  };
  useEffect(() => {
    if (!result.isSuccess || !retryFocused.current) return;
    retryFocused.current = false;
    // The retry button disappears on success. Don't take focus from another control.
    if (document.activeElement === document.body) title.current?.focus();
  }, [result.isSuccess]);
  return (
    <article>
      {!r && (
        <h2 id="restaurant-detail-title" className="sr-only">
          매장 상세
        </h2>
      )}
      {result.isError && !r ? (
        <ErrorState retry={retry} />
      ) : !r ? (
        <LoadingState>매장 확인 중…</LoadingState>
      ) : (
        <>
          {result.isError && (
            <div className="space-y-2 py-3">
              <p role="alert">
                최신 매장 정보를 확인하지 못했어요. 담은 매장은 유지돼요. 다시
                확인한 뒤 문의를 진행해 주세요.
              </p>
              <Button
                aria-disabled={result.isFetching}
                aria-busy={result.isFetching}
                onClick={retry}
                onFocus={() => {
                  retryFocused.current = true;
                }}
                onBlur={() => {
                  retryFocused.current = false;
                }}
              >
                {result.isFetching ? "매장 확인 중…" : "다시 시도"}
              </Button>
            </div>
          )}
          <div className="-mx-5">
            <RestaurantPhoto
              src={r.photoPath ?? spacePhoto?.path ?? null}
              alt={
                r.photoPath
                  ? `${r.name} 대표 사진`
                  : spacePhoto?.description || `${r.name} 공간 사진`
              }
              eager
              detail
            />
          </div>
          <div className="space-y-7 py-7">
            <h1
              ref={title}
              id="restaurant-detail-title"
              tabIndex={-1}
              className="px-5 text-label wrap-break-word"
            >
              {r.name}
            </h1>
            <dl className="mx-auto grid max-w-[300px] grid-cols-[5.5rem_minmax(0,1fr)] gap-x-5 gap-y-4 text-xs">
              <dt className="text-secondary">주소</dt>
              <dd className="wrap-break-word">{r.address}</dd>
              <dt className="text-secondary">전체 최대 인원</dt>
              <dd>
                {r.maxCapacity === null ? "확인 필요" : `${r.maxCapacity}명`}
              </dd>
              <dt className="text-secondary">음식 종류</dt>
              <dd className="wrap-break-word">{r.category ?? "확인 필요"}</dd>
              <dt className="text-secondary">영업·휴무</dt>
              <dd className="wrap-break-word whitespace-pre-line">
                {r.operatingHours ?? "확인 필요"}
              </dd>
              <dt className="text-secondary">편의시설</dt>
              <dd className="wrap-break-word whitespace-pre-line">
                {r.facilities ?? "확인 필요"}
              </dd>
            </dl>
            <div className="grid grid-cols-3 gap-2 min-[390px]:gap-[19px]">
              {infoActions.map(
                ({ section: value, label, icon, width, height }) => (
                  <Button
                    key={value}
                    variant="brand-outline"
                    aria-haspopup="dialog"
                    aria-expanded={section === value}
                    className="min-h-[69px] flex-col gap-2 rounded-control border-[0.5px] px-2 py-3 text-xs font-medium text-brand-ink shadow-control"
                    onClick={(event) => {
                      infoTrigger.current = event.currentTarget;
                      setSection(value);
                    }}
                  >
                    <Image
                      src={`/images/restaurants/${icon}.svg`}
                      alt=""
                      width={width}
                      height={height}
                    />
                    {label}
                  </Button>
                ),
              )}
            </div>
            <section>
              <h2 className="mb-3 text-sm font-semibold">위치 정보</h2>
              <Button
                variant="outline"
                className="relative min-h-[70px] w-full overflow-hidden rounded-control border-field bg-soft bg-[url('/images/restaurants/detail-map.svg')] bg-cover bg-center text-sm font-medium before:absolute before:inset-0 before:bg-white/50"
                onClick={() => onMap(r)}
              >
                <Image
                  src="/images/restaurants/detail-location.svg"
                  alt=""
                  width={18}
                  height={18}
                  className="relative"
                />
                <span className="relative">지도로 보기</span>
              </Button>
            </section>
            <div className="space-y-2">
              {(r.inquiryAvailable || selected) && (
                <Button
                  variant="brand-outline"
                  className="w-full border-field text-xs font-normal"
                  disabled={!selected && (full || result.isError)}
                  onClick={(event) => {
                    if (
                      !r.inquiryAvailable &&
                      document.activeElement === event.currentTarget
                    )
                      unavailableNotice.current?.focus();
                    onSelect();
                  }}
                >
                  {selected
                    ? "문의 담기 취소"
                    : full
                      ? "최대 3곳까지 담을 수 있어요"
                      : "문의 담기"}
                </Button>
              )}
              {(r.inquiryAvailable || (opensInquirySheet && selected)) && (
                <Button
                  className="w-full"
                  disabled={
                    (!selected && full) ||
                    (!opensInquirySheet && (selectionBlocked || !!inquiryIssue))
                  }
                  onClick={(event) => onInquiry(event.currentTarget)}
                >
                  {!selected && full
                    ? "선택한 매장을 먼저 빼 주세요"
                    : opensInquirySheet
                      ? "문의 진행하기"
                      : `선택한 ${targetCount}곳으로 계속`}
                </Button>
              )}
              {!r.inquiryAvailable && (
                <p
                  ref={unavailableNotice}
                  role="status"
                  tabIndex={-1}
                  className="rounded-control bg-background p-3"
                >
                  문의 수신 확인 전인 매장이에요. 현재는 문의를 접수할 수
                  없어요.
                </p>
              )}
              {!opensInquirySheet &&
                (selectionBlocked || inquiryIssue === "loading") &&
                r.inquiryAvailable &&
                !result.isError && (
                  <p role="status" className="text-sm text-muted">
                    선택한 매장을 모두 확인해야 계속할 수 있어요. 매장 목록에서
                    선택을 확인해 주세요.
                  </p>
                )}
            </div>
          </div>
          {section && (
            <RestaurantInfoSheet
              restaurant={r}
              section={section}
              returnFocusRef={infoTrigger}
              onClose={() => setSection(null)}
            />
          )}
        </>
      )}
    </article>
  );
}
