"use client";
import { Favorites } from "@/features/favorites/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { restaurantQuery } from "../api/restaurants.api";
import type { Restaurant } from "../types/restaurant.types";
import { RestaurantPhoto } from "./restaurant-photo";
import { spaceCost } from "../lib/space-cost";

export function RestaurantDetail({
  id,
  selected,
  full,
  targetCount,
  onSelect,
  onInquiry,
  onMap,
}: {
  id: string;
  selected: boolean;
  full: boolean;
  targetCount: number;
  onSelect: () => void;
  onInquiry: () => void;
  onMap: (restaurant: Restaurant) => void;
}) {
  const result = useQuery(restaurantQuery(id));
  const [section, setSection] = useState<"booking" | "spaces" | "menus">(
    "booking",
  );
  const r = result.data;
  return (
    <article className="pb-28">
      {(!r || result.isError) && (
        <h2 id="restaurant-detail-title" className="sr-only">
          매장 상세
        </h2>
      )}
      {result.isError && !r ? (
        <ErrorState retry={() => void result.refetch()} />
      ) : !r ? (
        <LoadingState>매장 확인 중…</LoadingState>
      ) : (
        <>
          <RestaurantPhoto
            src={r.photoPath}
            alt={`${r.name} 대표 사진`}
            eager
          />
          <div className="space-y-7 pt-6 pb-5">
            <h1 id="restaurant-detail-title" className="text-2xl font-bold">
              {r.name}
            </h1>
            <Favorites restaurantId={r.id} />
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-4 text-xs">
              <dt className="text-secondary">주소</dt>
              <dd>{r.address}</dd>
              <dt className="text-secondary">전체 최대 인원</dt>
              <dd>
                {r.maxCapacity === null ? "확인 필요" : `${r.maxCapacity}명`}
              </dd>
              <dt className="text-secondary">음식 종류</dt>
              <dd>{r.category ?? "확인 필요"}</dd>
              <dt className="text-secondary">영업·휴무</dt>
              <dd>{r.operatingHours ?? "확인 필요"}</dd>
              <dt className="text-secondary">편의시설</dt>
              <dd>{r.facilities ?? "확인 필요"}</dd>
            </dl>
            <div className="grid grid-cols-3 gap-2" aria-label="매장 정보 항목">
              {(
                [
                  ["booking", "예약 정보", "booking", 23.4, 19.8],
                  ["spaces", "공간 정보", "space", 19.062, 17.5],
                  ["menus", "메뉴판", "menu", 15.5, 20.5],
                ] as const
              ).map(([value, label, icon, width, height]) => (
                <Button
                  key={value}
                  variant="brand-outline"
                  aria-pressed={section === value}
                  className="min-h-[69px] flex-col gap-2 rounded-control border-[0.5px] px-2 py-3 text-xs font-normal text-brand-ink shadow-control aria-pressed:border-brand-ink aria-pressed:bg-choice aria-pressed:font-bold"
                  onClick={() => setSection(value)}
                >
                  <Image
                    src={`/images/restaurants/${icon}.svg`}
                    alt=""
                    width={width}
                    height={height}
                  />
                  {label}
                </Button>
              ))}
            </div>
            <section className="mt-6" aria-label="매장 상세 정보">
              <h3
                id="restaurant-info-title"
                className="mb-5 text-lg font-semibold"
              >
                {
                  {
                    booking: "예약 정보",
                    spaces: "공간 정보",
                    menus: "메뉴판",
                  }[section]
                }
              </h3>
              <section className="space-y-4 text-xs">
                {section === "spaces" && !!r.spacePhotos.length && (
                  <section aria-label="공간 사진" className="space-y-4">
                    {r.spacePhotos.map((photo, index) => (
                      <figure key={`${photo.path}:${index}`}>
                        <RestaurantPhoto
                          src={photo.path}
                          alt={photo.description}
                        />
                        <figcaption className="mt-2 text-xs text-muted">
                          {photo.description}
                        </figcaption>
                      </figure>
                    ))}
                  </section>
                )}

                {section === "booking" ? (
                  <dl className="space-y-3">
                    {[
                      ["예약 기준", r.bookingPolicy],
                      ["예약금", r.depositPolicy],
                      ["메뉴 주문", r.menuPolicy],
                      ["변경·취소", r.cancellationPolicy],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="font-semibold">{label}</dt>
                        <dd>{value ?? "확인 필요"}</dd>
                      </div>
                    ))}
                  </dl>
                ) : section === "menus" ? (
                  r.menus.length ? (
                    r.menus.map((m) => (
                      <div className="flex justify-between gap-2" key={m.id}>
                        <span>
                          {m.name} · {m.unit}
                        </span>
                        <span>
                          {m.price === null
                            ? "가격 확인 필요"
                            : `${m.price.toLocaleString()}원`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p>메뉴 정보 확인이 필요해요.</p>
                  )
                ) : (
                  r.spaces.map((s) => (
                    <article
                      key={s.id}
                      className="rounded-control border border-border p-3"
                    >
                      <h3 className="font-semibold">
                        {s.label} ·{" "}
                        {
                          {
                            AVAILABLE: "이용 방식 제공",
                            UNAVAILABLE: "불가",
                            UNKNOWN: "확인 필요",
                          }[s.availability]
                        }
                      </h3>
                      <p>
                        {s.kind === "HALL"
                          ? "일반 홀 · 단독 사용 아님"
                          : s.kind === "ROOM"
                            ? "별도 룸 · 다른 손님 없이 단독 사용"
                            : "다른 손님 없이 단독 사용"}
                      </p>
                      <p>
                        수용 인원 {s.capacity ?? "미확인"} · 함께 착석{" "}
                        {
                          { YES: "가능", NO: "불가", UNKNOWN: "미확인" }[
                            s.togetherSeating
                          ]
                        }
                      </p>
                      <p>
                        최소 인원{" "}
                        {s.minGuests === 0
                          ? "제한 없음"
                          : s.minGuests === null
                            ? "미확인"
                            : `${s.minGuests}명`}
                      </p>
                      <p>
                        {spaceCost("최소 이용금액", s.minSpend)} ·{" "}
                        {spaceCost("별도 대관료", s.separateFee)}
                      </p>
                      {s.conditions && <p>{s.conditions}</p>}
                    </article>
                  ))
                )}
              </section>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">위치 정보</h3>

              <Button
                variant="outline"
                className="min-h-[72px] w-full rounded-control border-field bg-soft text-sm font-normal"
                onClick={() => onMap(r)}
              >
                <Image
                  src="/images/restaurants/location.svg"
                  alt=""
                  width={18}
                  height={18}
                />
                지도로 보기
              </Button>
            </section>
            {r.inquiryAvailable ? (
              <div className="space-y-2">
                <Button
                  variant="brand-outline"
                  className="w-full border-field text-xs font-normal"
                  disabled={!selected && full}
                  onClick={onSelect}
                >
                  {selected
                    ? "문의 담기 취소"
                    : full
                      ? "최대 3곳까지 담을 수 있어요"
                      : "문의 담기"}
                </Button>
                <Button
                  className="w-full"
                  disabled={!selected && full}
                  onClick={onInquiry}
                >
                  {!selected && full
                    ? "선택한 매장을 먼저 빼 주세요"
                    : `선택한 ${targetCount}곳으로 계속`}
                </Button>
              </div>
            ) : (
              <p role="status" className="rounded-control bg-background p-3">
                문의 수신 확인 전인 매장이에요. 현재는 문의를 접수할 수 없어요.
              </p>
            )}
          </div>
        </>
      )}
    </article>
  );
}
