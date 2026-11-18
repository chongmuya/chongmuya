"use client";
import Image from "next/image";
import { useState } from "react";

const placeholder = "/images/restaurant-placeholder.png";

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
  const [failedPlaceholder, setFailedPlaceholder] = useState(false);
  const source = src && failedSource !== src ? src : placeholder;
  const isPlaceholder = source === placeholder;
  return (
    <div className="relative w-full bg-background" style={{ height }}>
      {isPlaceholder && failedPlaceholder ? (
        <div
          className="flex h-full items-center justify-center text-caption text-muted"
          role="img"
          aria-label="사진 없음"
        >
          등록된 사진이 없어요
        </div>
      ) : (
        <Image
          key={source}
          src={source}
          alt={isPlaceholder ? "" : alt}
          fill
          sizes="(max-width: 408px) 100vw, 408px"
          loading={eager || isPlaceholder ? "eager" : "lazy"}
          className="object-cover"
          onError={() =>
            isPlaceholder ? setFailedPlaceholder(true) : setFailedSource(src)
          }
        />
      )}
    </div>
  );
}
