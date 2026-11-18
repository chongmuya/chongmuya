"use client";
import Image from "next/image";
import { useState } from "react";

export function RestaurantPhoto({
  src,
  alt,
  height = 135,
  eager = false,
}: {
  src: string | null;
  alt: string;
  height?: number;
  eager?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className="relative w-full bg-background" style={{ height }}>
      {!src || failedSource === src ? (
        <div
          className="flex h-full items-center justify-center text-caption text-muted"
          role="img"
          aria-label="사진 없음"
        >
          등록된 사진이 없어요
        </div>
      ) : (
        <Image
          key={src}
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 408px) 100vw, 408px"
          loading={eager ? "eager" : "lazy"}
          className="object-cover"
          onError={() => setFailedSource(src)}
        />
      )}
    </div>
  );
}
