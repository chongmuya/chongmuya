"use client";
import Script from "next/script";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { RestaurantMap as MapRestaurant } from "../types/restaurant.types";

type NaverMap = {
  destroy: () => void;
  getCenter: () => { lat: () => number; lng: () => number };
  getZoom: () => number;
  setCenter: (point: unknown) => void;
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

export type MapViewport = { latitude: number; longitude: number; zoom: number };
export function RestaurantMap({
  restaurants,
  onOpen,
  focusId,
  viewport,
}: {
  focusId?: string | null;
  restaurants: MapRestaurant[];
  viewport?: RefObject<MapViewport | null>;
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
  const instance = useRef<NaverMap | null>(null);
  const lastFocus = useRef<string | null>(null);
  // Updating markers never recreates the map or resets the user's viewport.
  useEffect(() => {
    if (
      !ready ||
      failed ||
      noCoordinates ||
      !container.current ||
      !window.naver?.maps
    )
      return;
    const maps = window.naver.maps;
    const points = restaurants.filter(
      (r) => r.latitude !== null && r.longitude !== null,
    );
    const markers: Marker[] = [];
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !container.current) return;
      try {
        if (!instance.current) {
          const first = points.find((r) => r.id === focusId) ?? points[0]!;
          const saved = viewport?.current;
          instance.current = new maps.Map(container.current, {
            center: new maps.LatLng(
              saved?.latitude ?? first.latitude!,
              saved?.longitude ?? first.longitude!,
            ),
            zoom: saved?.zoom ?? 17,
          });
          if (!saved && !focusId && points.length > 1)
            instance.current.fitBounds(
              points.map((r) => new maps.LatLng(r.latitude!, r.longitude!)),
              { top: 80, right: 60, bottom: 120, left: 60, maxZoom: 18 },
            );
          lastFocus.current = focusId ?? null;
        } else if (focusId && lastFocus.current !== focusId) {
          const focused = points.find((r) => r.id === focusId);
          if (focused)
            instance.current.setCenter(
              new maps.LatLng(focused.latitude!, focused.longitude!),
            );
          lastFocus.current = focusId;
        }
        for (const restaurant of points) {
          const label = document.createElement("button");
          label.type = "button";
          label.className =
            "-translate-x-1/2 -translate-y-full whitespace-nowrap rounded-control bg-brand px-3 py-3 text-sm font-semibold text-white shadow-control";
          label.textContent = restaurant.name;
          label.addEventListener("click", () => open.current(restaurant.id));
          markers.push(
            new maps.Marker({
              map: instance.current,
              position: new maps.LatLng(
                restaurant.latitude!,
                restaurant.longitude!,
              ),
              title: restaurant.name,
              icon: { content: label, anchor: { x: 0, y: 0 } },
            }),
          );
        }
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [ready, failed, restaurants, focusId, noCoordinates, viewport]);
  useEffect(() => {
    if ((failed || noCoordinates) && instance.current) {
      instance.current.destroy();
      instance.current = null;
    }
  }, [failed, noCoordinates]);
  useEffect(
    () => () => {
      const map = instance.current;
      if (!map) return;
      try {
        if (viewport) {
          const center = map.getCenter();
          viewport.current = {
            latitude: center.lat(),
            longitude: center.lng(),
            zoom: map.getZoom(),
          };
        }
        map.destroy();
      } finally {
        instance.current = null;
      }
    },
    [viewport],
  );
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
            className="h-[calc(100svh-240px)] min-h-[360px] w-full bg-soft"
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
