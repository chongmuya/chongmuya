"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { FileAccess, FileRecord } from "../types/file.types";
import { filesPath } from "../api/files.api";
export function FilePreview({
  access: a,
  file,
}: {
  access: FileAccess;
  file: FileRecord;
}) {
  const path = `${filesPath(a)}/${file.id}/download` as const,
    request = a.request;
  const [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    const abort = new AbortController();
    void request<Blob>(path, {
      headers: { Accept: "application/octet-stream" },
      signal: abort.signal,
    })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: file.mime }));
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, request, file.mime]);
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
