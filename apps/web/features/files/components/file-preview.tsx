"use client";
import Image from "next/image";
import type { FileAccess, FileRecord } from "../types/file.types";
import { useFilePreview } from "../hooks/use-file-preview";
export function FilePreview({
  access: a,
  file,
}: {
  access: FileAccess;
  file: FileRecord;
}) {
  const { url, failed } = useFilePreview(a, file);
  return failed ? (
    <p role="alert">
      미리보기를 불러오지 못했습니다. 원본 다운로드를 다시 시도해 주세요.
    </p>
  ) : url ? (
    <Image
      src={url}
      alt={`${file.name} 첨부 이미지`}
      width={320}
      height={240}
      unoptimized
      className="mt-3 h-auto max-h-80 w-full rounded object-contain"
    />
  ) : (
    <p role="status">미리보기를 불러오는 중입니다.</p>
  );
}
