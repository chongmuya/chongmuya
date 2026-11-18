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
    if (!ready || failed || !container.current || !window.naver?.maps) return;
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
  }, [ready, failed, restaurants, focusId]);
  return (
    <section aria-label="매장 지도" className="relative">
      {key && (
        <Script
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`}
          onReady={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!key || failed ? (
        <p
          role="status"
          className="rounded-control border border-border bg-surface p-6 text-sm"
        >
          지도를 표시할 수 없어요. 목록으로 돌아가 매장과 주소를 확인할 수
          있어요.
        </p>
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
