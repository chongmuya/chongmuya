"use client";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/shared/lib/cn";

export function RestaurantPhoto({
  src,
  alt,
  height = 135,
  eager = false,
  detail = false,
}: {
  src: string | null;
  alt: string;
  height?: number;
  eager?: boolean;
  detail?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div
      className={cn("relative w-full bg-background", detail && "aspect-3/1")}
      style={detail ? undefined : { height }}
    >
      {src && failedSource !== src ? (
        <Image
          key={src}
          src={src}
          alt={alt}
          fill
          sizes={
            detail
              ? "(max-width: 402px) 100vw, 402px"
              : "(max-width: 408px) 100vw, 408px"
          }
          loading={eager ? "eager" : "lazy"}
          className="object-cover"
          onError={() => setFailedSource(src)}
        />
      ) : detail ? (
        <>
          <Image
            src="/images/restaurants/demo-1.png"
            alt=""
            fill
            sizes="(max-width: 402px) 100vw, 402px"
            loading={eager ? "eager" : "lazy"}
            className="object-cover"
          />
          <span className="absolute right-4 bottom-3 rounded-pill bg-black/75 px-2 py-1 text-xs text-white">
            예시 이미지
          </span>
        </>
      ) : (
        <div
          className="flex h-full items-center justify-center text-caption text-muted"
          role="img"
          aria-label="사진 없음"
        >
          <Image
            src="/images/restaurants/menu.svg"
            alt=""
            width={40}
            height={40}
            className="opacity-40"
          />
        </div>
      )}
    </div>
  );
}
