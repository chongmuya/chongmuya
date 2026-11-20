import { queryOptions } from "@tanstack/react-query";
import type { FileAccess, FileRecord } from "../types/file.types";
export const FILE_TRANSFER_TIMEOUT_MS = 120_000;
export const filesKey = (a: FileAccess) => [
  "user",
  a.accountId,
  "files",
  a.eventId,
];
export const filesPath = (a: FileAccess): `/api/v1/${string}` =>
  `/api/v1/events/${a.eventId}/files`;
export function uploadFile(a: FileAccess, id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("filename", file.name);
  return a.request(
    `${filesPath(a)}/${id}/upload`,
    { method: "POST", body },
    FILE_TRANSFER_TIMEOUT_MS,
  );
}
export function deleteFile(a: FileAccess, file: FileRecord) {
  return a.request(
    `${filesPath(a)}/${file.id}/delete`,
    {
      method: "POST",
      body: JSON.stringify({ expectedVersion: file.version }),
    },
    FILE_TRANSFER_TIMEOUT_MS,
  );
}
export function downloadFile(a: FileAccess, id: string, signal?: AbortSignal) {
  return a.request<Blob>(
    `${filesPath(a)}/${id}/download`,
    {
      headers: { Accept: "application/octet-stream" },
      signal,
    },
    FILE_TRANSFER_TIMEOUT_MS,
  );
}
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
