import { queryOptions } from "@tanstack/react-query";
import type { FileAccess, FileRecord } from "../types/file.types";
export const filesKey = (a: FileAccess) => [
  "user",
  a.accountId,
  "files",
  a.eventId,
];
export const filesPath = (a: FileAccess): `/api/v1/${string}` =>
  `/api/v1/events/${a.eventId}/files`;
export const filesQuery = (a: FileAccess) =>
  queryOptions({
    queryKey: filesKey(a),
    queryFn: ({ signal }) =>
      a.request<{
        files: FileRecord[];
        limits: { bytesPerFile: number; count: number; totalBytes: number };
      }>(filesPath(a), { signal }),
    retry: false,
    staleTime: 0,
  });
