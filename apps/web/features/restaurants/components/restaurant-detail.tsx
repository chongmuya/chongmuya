"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Image from "next/image";
import { Dialog } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { restaurantQuery } from "../api/restaurants.api";

export function RestaurantDetail({
  id,
  selected,
  full,
  onClose,
  onSelect,
  onInquiry,
  onMap,
}: {
  id: string;
  selected: boolean;
  full: boolean;
  onClose: () => void;
  onSelect: () => void;
  onInquiry: () => void;
  onMap: () => void;
}) {
  const result = useQuery(restaurantQuery(id));
  const [section, setSection] = useState<"booking" | "spaces" | "menus">(
    "booking",
  );
  const r = result.data;
  return (
    <Dialog
      labelledBy="restaurant-detail-title"
      onClose={onClose}
      showCloseButton
      className="max-w-[402px] p-5"
    >
      {result.isError ? (
        <ErrorState retry={() => void result.refetch()} />
      ) : !r ? (
        <LoadingState>매장 확인 중…</LoadingState>
      ) : (
        <>
          {r.photoPath ? (
            <Image
              src={r.photoPath}
              alt={`${r.name} 음식 예시`}
              width={362}
              height={140}
              className="mt-4 h-36 w-full rounded-control object-cover"
            />
          ) : (
            <div className="mt-4 flex h-32 items-center justify-center rounded-control bg-background text-caption text-muted">
              등록된 사진이 없어요
            </div>
          )}
          <h2 id="restaurant-detail-title" className="mt-5 text-xl font-bold">
            {r.name}
          </h2>
          {r.isDemo && (
            <p className="text-xs text-brand">
              개발용 가상 매장 · 실제 예약·연락 대상 아님
            </p>
          )}
          <dl className="my-6 grid grid-cols-[5rem_1fr] gap-3 text-sm">
            <dt className="text-muted">주소</dt>
            <dd>{r.address}</dd>
            <dt className="text-muted">음식 종류</dt>
            <dd>{r.category ?? "확인 필요"}</dd>
            <dt className="text-muted">영업·휴무</dt>
            <dd>{r.operatingHours ?? "확인 필요"}</dd>
            <dt className="text-muted">편의시설</dt>
            <dd>{r.facilities ?? "확인 필요"}</dd>
          </dl>
          <div className="grid grid-cols-3 gap-2" aria-label="매장 정보 항목">
            {(
              [
                ["booking", "예약 정보"],
                ["spaces", "공간 정보"],
                ["menus", "메뉴판"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant="brand-outline"
                aria-pressed={section === value}
                className="rounded-control px-2 text-sm"
                onClick={() => setSection(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <section aria-live="polite" className="my-5 space-y-3 text-sm">
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
                    최소 이용금액{" "}
                    {s.minSpend === null
                      ? "확인 필요"
                      : `${s.minSpend.toLocaleString()}원`}{" "}
                    · 별도 대관료{" "}
                    {s.separateFee === null
                      ? "확인 필요"
                      : `${s.separateFee.toLocaleString()}원`}
                  </p>
                  {s.conditions && <p>{s.conditions}</p>}
                </article>
              ))
            )}
          </section>
          <p className="mb-4 text-xs text-muted">
            공개 조건은 실시간 예약 가능 여부가 아니에요. 날짜와 실제 조건은
            매장 확인이 필요해요.
          </p>
          <Button variant="outline" className="mb-4 w-full" onClick={onMap}>
            지도로 보기
          </Button>
          {r.inquiryAvailable ? (
            <div className="space-y-2">
              <Button
                variant="brand-outline"
                className="w-full"
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
                이 매장에 문의하기
              </Button>
            </div>
          ) : (
            <p role="status" className="rounded-control bg-background p-3">
              문의 수신 확인 전인 매장이에요. 현재는 문의를 접수할 수 없어요.
            </p>
          )}
          <Button variant="outline" className="mt-2 w-full" onClick={onClose}>
            닫기
          </Button>
        </>
      )}
    </Dialog>
  );
}
