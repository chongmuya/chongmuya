"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { Restaurant } from "../types/restaurant.types";

type NaverMap = { destroy: () => void };
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
  }) => Marker;
  Event: {
    addListener: (
      target: Marker,
      event: string,
      callback: () => void,
    ) => unknown;
    removeListener: (listener: unknown) => void;
  };
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
}: {
  restaurants: Restaurant[];
  onOpen: (id: string) => void;
}) {
  const key = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
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
    if (!points.length) return;
    const element = container.current;
    const maps = window.naver.maps;
    const listeners: unknown[] = [];
    const markers: Marker[] = [];
    let map: NaverMap | undefined;
    const frame = requestAnimationFrame(() => {
      try {
        const first = points[0]!;
        map = new maps.Map(element, {
          center: new maps.LatLng(first.latitude!, first.longitude!),
          zoom: 14,
        });
        for (const restaurant of points) {
          const marker = new maps.Marker({
            map,
            position: new maps.LatLng(
              restaurant.latitude!,
              restaurant.longitude!,
            ),
            title: restaurant.name,
          });
          markers.push(marker);
          listeners.push(
            maps.Event.addListener(marker, "click", () =>
              open.current(restaurant.id),
            ),
          );
        }
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      // An authorization failure can invalidate the SDK while this map is mounted.
      try {
        listeners.forEach((listener) => maps.Event.removeListener(listener));
        markers.forEach((marker) => marker.setMap(null));
        map?.destroy();
      } catch {
        // The SDK has already disposed of its internal objects.
      }
    };
  }, [ready, failed, restaurants]);
  return (
    <section aria-label="매장 지도" className="mb-6">
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
          지도를 표시할 수 없어요. 아래 매장 목록과 주소로 계속 진행할 수
          있어요.
        </p>
      ) : (
        <>
          <div
            ref={container}
            className="h-[420px] w-full rounded-control bg-border/30"
          />
          <p role="status" className="text-xs text-muted">
            {ready
              ? "표시된 위치는 공개 주소 기준이에요. 아래 목록에서도 매장을 선택할 수 있어요."
              : "지도 불러오는 중… 목록과 주소는 바로 이용할 수 있어요."}
          </p>
        </>
      )}
    </section>
  );
}
