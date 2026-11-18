"use client";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/shared/lib/cn";

export function RestaurantPhoto({
  src,
  alt,
  height = 135,
}: {
  src: string | null;
  alt: string;
  height?: number;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return src && failedSource !== src ? (
    <Image
      src={src}
      alt={alt}
      width={362}
      height={height}
      style={{ height }}
      className="w-full object-cover"
      onError={() => setFailedSource(src)}
    />
  ) : (
    <div
      style={{ height }}
      className={cn(
        "flex w-full items-center justify-center bg-background text-caption text-muted",
      )}
      role="img"
      aria-label="사진 없음"
    >
      등록된 사진이 없어요
    </div>
  );
}
