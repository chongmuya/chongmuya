"use client";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/http/api-error";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import {
  filesKey,
  filesQuery,
  uploadFile,
  deleteFile,
  downloadFile,
} from "../api/files.api";
import type { FileAccess, FileRecord } from "../types/file.types";
export function useEventFiles(
  a: FileAccess,
  onUploaded?: (id: string) => void,
) {
  const input = useRef<HTMLInputElement>(null);
  const [hasPending, setHasPending] = useState(false);
  const q = useQuery(filesQuery(a)),
    cache = useQueryClient(),
    active = useActiveScreen(),
    pending = useRef<{ id: string; file: File } | null>(null),
    [notice, setNotice] = useState(""),
    [remove, setRemove] = useState<FileRecord | null>(null);
  const refresh = () => {
    if (active.current) void cache.invalidateQueries({ queryKey: filesKey(a) });
  };
  const upload = useMutation({
    mutationFn: async () => {
      if (!pending.current) return;
      const { id, file } = pending.current;
      await uploadFile(a, id, file);
      return id;
    },
    retry: false,
    onSuccess: (id) => {
      pending.current = null;
      if (input.current) input.current.value = "";
      if (active.current) {
        setHasPending(false);
        if (id && onUploaded) onUploaded(id);
        else
          setNotice(
            "행사 자료에 저장했습니다. 지출을 취소해도 행사 자료에 남습니다.",
          );
      }
      refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && [400, 413].includes(error.status)) {
        pending.current = null;
        if (input.current) input.current.value = "";
        if (active.current) setHasPending(false);
      }
      refresh();
    },
  });
  const deletion = useMutation({
    mutationFn: (f: FileRecord) => deleteFile(a, f),
    onSuccess: () => {
      if (active.current) setRemove(null);
      refresh();
    },
    onError: refresh,
  });
  const download = useMutation({
    mutationFn: async (f: FileRecord) => {
      const b = await downloadFile(a, f.id);
      if (!active.current) return;
      const url = URL.createObjectURL(b),
        link = document.createElement("a");
      link.href = url;
      link.download = f.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const startUpload = (file: File) => {
    if (file.size > 10485760) {
      setNotice("파일당 10MB 이하로 선택해 주세요.");
      return;
    }
    pending.current = { id: crypto.randomUUID(), file };
    setHasPending(true);
    setNotice("");
    upload.mutate();
  };
  const abandonUpload = () => {
    pending.current = null;
    setHasPending(false);
    if (input.current) input.current.value = "";
    upload.reset();
    setNotice(
      "이 시도의 재시도를 중단했습니다. 이미 저장된 파일은 삭제되지 않습니다. 목록을 확인하고 다른 파일을 선택할 수 있습니다.",
    );
    refresh();
  };
  return {
    input,
    hasPending,
    q,
    notice,
    remove,
    setRemove,
    upload,
    deletion,
    download,
    startUpload,
    abandonUpload,
  };
}
