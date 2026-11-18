"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { Restaurant } from "../types/restaurant.types";

type NaverMap = {
  destroy: () => void;
  fitBounds: (
    coordinates: unknown[],
    options: {
      top: number;
      right: number;
      bottom: number;
      left: number;
      maxZoom: number;
    },
  ) => void;
};
type Marker = { setMap: (map: null) => void };
type Maps = {
  Map: new (
    element: HTMLElement,
    options: { center: unknown; zoom: number },
  ) => NaverMap;
  LatLng: new (latitude: number, longitude: number) => unknown;
  Marker: new (options: {
    map: NaverMap;
    position: unknown;
    title: string;
    icon: { content: HTMLElement; anchor: { x: number; y: number } };
  }) => Marker;
};
declare global {
  interface Window {
    naver?: { maps: Maps };
    navermap_authFailure?: () => void;
  }
}

export function RestaurantMap({
  restaurants,
  onOpen,
  focusId,
}: {
  focusId?: string | null;
  restaurants: Restaurant[];
  onOpen: (id: string) => void;
}) {
  const key = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim();
  const focused = restaurants.find((restaurant) => restaurant.id === focusId);
  const noCoordinates = focused
    ? focused.latitude === null || focused.longitude === null
    : !restaurants.some(
        (restaurant) =>
          restaurant.latitude !== null && restaurant.longitude !== null,
      );
  const addressItems = focused ? [focused] : restaurants;
  const container = useRef<HTMLDivElement>(null);
  const open = useRef(onOpen);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    open.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    if (!key) return;
    const previous = window.navermap_authFailure;
    window.navermap_authFailure = () => setFailed(true);
    const timer = setTimeout(() => {
      if (!window.naver?.maps) setFailed(true);
    }, 8000);
    return () => {
      clearTimeout(timer);
      window.navermap_authFailure = previous;
    };
  }, [key]);
  useEffect(() => {
    if (
      !ready ||
      failed ||
      noCoordinates ||
      !container.current ||
      !window.naver?.maps
    )
      return;
    const points = restaurants.filter(
      (r) => r.latitude !== null && r.longitude !== null,
    );

    const element = container.current;
    const maps = window.naver.maps;

    const markers: Marker[] = [];
    let map: NaverMap | undefined;
    const frame = requestAnimationFrame(() => {
      try {
        const first =
          points.find((restaurant) => restaurant.id === focusId) ?? points[0];
        map = new maps.Map(element, {
          center: new maps.LatLng(
            first?.latitude ?? 37.5404,
            first?.longitude ?? 127.0692,
          ),
          zoom: points.length ? 17 : 14,
        });
        if (!focusId && points.length > 1) {
          map.fitBounds(
            points.map(
              (restaurant) =>
                new maps.LatLng(restaurant.latitude!, restaurant.longitude!),
            ),
            { top: 100, right: 90, bottom: 140, left: 90, maxZoom: 18 },
          );
        }
        for (const restaurant of points) {
          const label = document.createElement("button");
          label.type = "button";
          label.className =
            "relative -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-sm bg-brand px-3 py-3 text-sm font-semibold text-white shadow-control";
          label.textContent = restaurant.name;
          const tail = document.createElement("img");
          tail.src = "/images/restaurants/marker-tail.svg";
          tail.alt = "";
          tail.setAttribute("width", "14.5932");
          tail.setAttribute("height", "17.1448");
          tail.className =
            "absolute top-full left-1/2 -translate-x-1/2 -mt-1 rotate-180";
          label.append(tail);
          label.addEventListener("click", () => open.current(restaurant.id));
          const marker = new maps.Marker({
            map,
            position: new maps.LatLng(
              restaurant.latitude!,
              restaurant.longitude!,
            ),
            title: restaurant.name,
            icon: { content: label, anchor: { x: 0, y: 0 } },
          });
          markers.push(marker);
        }
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      // An authorization failure can invalidate the SDK while this map is mounted.
      try {
        markers.forEach((marker) => marker.setMap(null));
        map?.destroy();
      } catch {
        // The SDK has already disposed of its internal objects.
      }
    };
  }, [ready, failed, restaurants, focusId, noCoordinates]);
  return (
    <section aria-label="매장 지도" className="relative">
      {key && !noCoordinates && (
        <Script
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`}
          onReady={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {noCoordinates || !key || failed ? (
        <div className="space-y-4 p-5 pb-32">
          <p role="status" className="text-sm">
            {noCoordinates
              ? "지도 위치 정보가 없습니다"
              : "지도를 표시할 수 없어요. 매장 주소를 확인해 주세요."}
          </p>
          {addressItems.length ? (
            <ul className="space-y-3">
              {addressItems.map((restaurant) => (
                <li
                  key={restaurant.id}
                  className="rounded-control bg-surface p-4"
                >
                  <button
                    className="text-left text-sm"
                    onClick={() => onOpen(restaurant.id)}
                  >
                    <strong>{restaurant.name}</strong>
                    <p className="mt-2">{restaurant.address}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">
              표시할 매장이 없어요. 지역 조건을 바꿔 주세요.
            </p>
          )}
        </div>
      ) : (
        <>
          <div
            ref={container}
            className="h-[calc(100svh-103px)] min-h-[360px] w-full bg-soft"
          />
          {!ready && (
            <p
              role="status"
              className="absolute top-3 right-5 left-5 rounded-control bg-surface/90 p-2 text-xs text-muted"
            >
              지도 불러오는 중…
            </p>
          )}
        </>
      )}
    </section>
  );
}
