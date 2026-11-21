"use client";

import type { RefObject } from "react";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { spaceCost } from "../lib/space-cost";
import type { Restaurant } from "../types/restaurant.types";
import { RestaurantPhoto } from "./restaurant-photo";

const titles = {
  booking: "예약 정보",
  spaces: "공간별 이용조건",
  menus: "메뉴판",
} as const;

export type RestaurantInfoSection = keyof typeof titles;

export function RestaurantInfoSheet({
  restaurant,
  section,
  onClose,
  returnFocusRef,
}: {
  restaurant: Restaurant;
  section: RestaurantInfoSection;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <BottomSheet
      title={titles[section]}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      closeAtStart
    >
      {section === "booking" && <BookingDetails restaurant={restaurant} />}
      {section === "spaces" && <SpaceDetails restaurant={restaurant} />}
      {section === "menus" && <MenuDetails menus={restaurant.menus} />}
    </BottomSheet>
  );
}

function BookingDetails({ restaurant }: { restaurant: Restaurant }) {
  const {
    maxCapacity,
    bookingPolicy,
    depositPolicy,
    menuPolicy,
    cancellationPolicy,
  } = restaurant;

  return (
    <dl className="space-y-4 px-2 text-sm">
      {[
        [
          "전체 수용 인원",
          maxCapacity === null ? null : `최대 ${maxCapacity}명`,
        ],
        ["사전 예약", bookingPolicy],
        ["예약금", depositPolicy],
        ["메뉴 주문", menuPolicy],
        ["변경 · 취소 · 환불", cancellationPolicy],
      ].map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,6.75rem)_minmax(0,1fr)] gap-x-3"
        >
          <dt className="text-secondary">{label}</dt>
          <dd className="wrap-break-word whitespace-pre-line">
            {value ?? "확인 필요"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SpaceDetails({ restaurant }: { restaurant: Restaurant }) {
  const { spaces, spacePhotos } = restaurant;

  return (
    <div className="space-y-4">
      {spaces.map((space) => (
        <article key={space.id} className="rounded-control bg-soft p-4">
          <h3 className="text-control font-semibold">{space.label}</h3>
          {space.availability === "AVAILABLE" ? (
            <div className="mt-2 space-y-1 text-sm wrap-break-word text-secondary">
              <p>
                {space.capacity === null
                  ? "수용 인원 확인 필요"
                  : `최대 ${space.capacity}명`}
              </p>
              <p>
                {space.kind === "HALL"
                  ? "다른 손님과 공유"
                  : "다른 손님 없이 단독 사용"}
                {" · 함께 착석 "}
                {
                  { YES: "가능", NO: "불가", UNKNOWN: "확인 필요" }[
                    space.togetherSeating
                  ]
                }
              </p>
              <p>
                최소 인원{" "}
                {space.minGuests === 0
                  ? "제한 없음"
                  : space.minGuests === null
                    ? "확인 필요"
                    : `${space.minGuests}명`}
              </p>
              <p>{spaceCost("최소 이용금액", space.minSpend)}</p>
              <p>{spaceCost("별도 대관료", space.separateFee)}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-secondary">
              {space.availability === "UNAVAILABLE"
                ? "이용할 수 없는 공간이에요."
                : "매장 확인이 필요한 항목이에요."}
            </p>
          )}
          {space.conditions && (
            <p className="mt-2 text-sm wrap-break-word whitespace-pre-line text-secondary">
              {space.conditions}
            </p>
          )}
        </article>
      ))}
      {!spaces.length && (
        <p className="text-sm text-secondary">공간 정보 확인이 필요해요.</p>
      )}
      {spacePhotos.length > 0 && (
        <section aria-label="공간 사진" className="space-y-4">
          {spacePhotos.map((photo, index) => (
            <figure key={`${photo.path}:${index}`}>
              <div className="overflow-hidden rounded-control">
                <RestaurantPhoto src={photo.path} alt={photo.description} />
              </div>
              <figcaption className="mt-2 text-xs text-secondary">
                {photo.description}
              </figcaption>
            </figure>
          ))}
        </section>
      )}
    </div>
  );
}

function MenuDetails({ menus }: { menus: Restaurant["menus"] }) {
  if (!menus.length)
    return <p className="text-sm text-secondary">메뉴 정보 확인이 필요해요.</p>;

  return (
    <ul className="divide-y divide-border">
      {menus.map((menu) => (
        <li
          key={menu.id}
          className="flex min-h-14 items-center justify-between gap-3 py-3"
        >
          <span className="min-w-0 text-control font-medium wrap-break-word">
            {menu.name}{" "}
            <span className="text-xs font-normal text-secondary">
              {menu.unit}
            </span>
          </span>
          <span className="shrink-0 text-right text-sm tabular-nums">
            {menu.price === null
              ? "가격 확인 필요"
              : `${menu.price.toLocaleString()}원`}
          </span>
        </li>
      ))}
    </ul>
  );
}
