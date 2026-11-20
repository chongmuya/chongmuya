"use client";
import { useEffect, useState } from "react";
import { downloadFile } from "../api/files.api";
import type { FileAccess, FileRecord } from "../types/file.types";
export function useFilePreview(a: FileAccess, file: FileRecord) {
  const { request, accountId, eventId } = a;
  const [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    const abort = new AbortController();
    void downloadFile({ request, accountId, eventId }, file.id, abort.signal)
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
  }, [accountId, eventId, request, file.id, file.mime]);
  return { url, failed };
}
