"use client";
import { FilePreview } from "./file-preview";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { ApiError } from "@/shared/http/api-error";
import { useEventFiles } from "../hooks/use-event-files";
import type { FileAccess } from "../types/file.types";
const labels = {
  UPLOADING: "업로드 중",
  READY: "완료",
  FAILED: "업로드 실패",
  DELETING: "삭제 중",
  DELETE_FAILED: "삭제 실패",
  DELETED: "삭제됨",
};
export function EventFiles({
  access: a,
  selected,
  onSelect,
  expenses = [],
  onUploaded,
  onUploadBusyChange,
}: {
  access: FileAccess;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  expenses?: { id: string; name: string }[];
  onUploaded?: (id: string) => void;
  onUploadBusyChange?: (busy: boolean) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const {
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
  } = useEventFiles(a, onUploaded);
  useEffect(() => {
    onUploadBusyChange?.(hasPending);
  }, [hasPending, onUploadBusyChange]);
  if (q.error instanceof ApiError && [401, 403, 404].includes(q.error.status))
    return <p role="alert">자료에 접근할 수 없습니다.</p>;
  const fileInput = (
    <input
      ref={input}
      aria-label="행사 파일 선택"
      type="file"
      accept=".jpg,.jpeg,.png,.webp,.pdf,.xls,.xlsx"
      disabled={upload.isPending || hasPending}
      tabIndex={onUploaded ? -1 : undefined}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) startUpload(file);
      }}
      className={onUploaded ? "sr-only" : "block w-full text-xs"}
    />
  );
  const uploadStatus = (
    <>
      {notice && <p role="status">{notice}</p>}
      {upload.isPending && <p role="status">업로드 중입니다.</p>}
      {[q.error, upload.error, deletion.error, download.error]
        .filter(Boolean)
        .map((e, i) => (
          <p key={i} role="alert" className="text-danger">
            {safeErrorMessage(e)}
          </p>
        ))}
      {q.error && (
        <Button variant="outline" onClick={() => void q.refetch()}>
          파일 다시 조회
        </Button>
      )}
      {hasPending && !upload.isPending && (
        <div className="space-y-2">
          <p role="status">
            {upload.error instanceof ApiError && upload.error.status === 409
              ? "파일 한도 또는 상태 충돌입니다. 목록을 확인한 뒤 재시도하거나 다른 파일을 선택해 주세요."
              : "저장 완료를 확인하지 못했습니다. 같은 파일·요청으로 재확인할 수 있습니다."}
          </p>
          <Button onClick={() => upload.mutate()}>
            같은 파일 업로드 재시도
          </Button>
          <Button variant="outline" onClick={abandonUpload}>
            이 시도 그만두고 다른 파일 선택
          </Button>
        </div>
      )}
    </>
  );
  if (onUploaded && onSelect && selected) {
    const files = q.data?.files ?? [];
    const available = files.filter(
      (file) =>
        file.status === "READY" &&
        !file.expenseId &&
        !selected.includes(file.id),
    );
    return (
      <section className="space-y-3 text-xs" aria-label="영수증 첨부">
        <div className="flex items-center justify-between gap-2">
          {selected.length ? (
            <button
              type="button"
              className="min-h-5 cursor-pointer text-left disabled:opacity-60"
              aria-label="영수증 추가 첨부하기"
              disabled={upload.isPending || hasPending}
              onClick={() => input.current?.click()}
            >
              영수증 첨부하기
            </button>
          ) : (
            <>
              <h3>영수증 첨부하기</h3>
              <Button
                variant="outline"
                className="rounded-control border-placeholder px-3 text-sm text-secondary"
                disabled={upload.isPending || hasPending}
                onClick={() => input.current?.click()}
              >
                파일 선택
              </Button>
            </>
          )}
          {fileInput}
        </div>
        {uploadStatus}
        {selected.map((id) => {
          const file = files.find(
            (item) => item.id === id && item.status === "READY",
          );
          const label = file?.name ?? "첨부한 영수증";
          return (
            <div
              key={id}
              className="flex min-h-10 items-center justify-between gap-2 rounded-control border border-brand pl-2.5 text-sm"
            >
              <span className="min-w-0 wrap-anywhere">{label}</span>
              <IconButton
                aria-label={`${label} 연결 해제`}
                className="size-9"
                onClick={() => onSelect(selected.filter((item) => item !== id))}
              >
                <Image
                  src="/images/ui/close.svg"
                  alt=""
                  width={15}
                  height={15}
                />
              </IconButton>
            </div>
          );
        })}
        {available.length > 0 && (
          <details>
            <summary className="cursor-pointer text-secondary">
              저장된 파일 선택
            </summary>
            <ul className="space-y-2 pt-2">
              {available.map((file) => (
                <li key={file.id}>
                  <Button
                    variant="outline"
                    onClick={() => onSelect([...selected, file.id])}
                  >
                    {file.name}
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }
  return (
    <section className="space-y-4" aria-label="행사 첨부 자료">
      <div className="rounded-[20px] bg-choice p-6 text-center">
        <h3 className="text-xl font-semibold">행사 기록을 모아주세요</h3>
        <p className="my-3 text-xs text-secondary">
          이미지·PDF·엑셀 원본 / 파일당 10MB (10,485,760바이트)
          <br />
          HEIC는 JPEG 또는 PNG로 변환해 주세요.
        </p>
        <label className="block">
          파일 선택
          {fileInput}
        </label>
      </div>
      <Button variant="outline" onClick={() => void q.refetch()}>
        파일 상태 새로 조회
      </Button>
      {q.isPending && q.isFetching && (
        <p role="status">파일을 불러오는 중입니다.</p>
      )}
      {q.data && (
        <p className="text-xs text-secondary">
          운영 한도: 행사당 {q.data.limits.count}개 · 총{" "}
          {Math.floor(q.data.limits.totalBytes / 1048576)}MB. 완료 자료{" "}
          {q.data.files.filter((f) => f.status === "READY").length}개
        </p>
      )}
      {uploadStatus}
      {q.data?.files.map((f) => (
        <article key={f.id} className="rounded-lg border border-brand p-3">
          <div className="break-all font-semibold">{f.name}</div>
          <p className="text-xs text-secondary">
            {f.size.toLocaleString()}바이트 · {labels[f.status]} ·{" "}
            {expenses.find((e) => e.id === f.expenseId)?.name ??
              (f.expenseId ? "연결된 지출" : "행사 자료")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {f.status === "READY" && (
              <>
                <Button
                  variant="outline"
                  disabled={download.isPending}
                  onClick={() => download.mutate(f)}
                >
                  원본 다운로드
                </Button>
                {onSelect && (!f.expenseId || selected?.includes(f.id)) && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected?.includes(f.id) ?? false}
                      onChange={(e) =>
                        onSelect(
                          e.target.checked
                            ? [...(selected ?? []), f.id]
                            : (selected ?? []).filter((id) => id !== f.id),
                        )
                      }
                    />
                    영수증 연결
                  </label>
                )}
              </>
            )}
            {
              <Button
                variant="outline"
                disabled={deletion.isPending}
                onClick={() => setRemove(f)}
              >
                {f.status === "DELETE_FAILED" || f.status === "DELETING"
                  ? "삭제 재시도"
                  : "파일 삭제"}
              </Button>
            }
          </div>
          {f.status === "READY" && f.mime.startsWith("image/") && (
            <Button
              variant="outline"
              onClick={() => setPreviewId(previewId === f.id ? null : f.id)}
            >
              {previewId === f.id ? "미리보기 닫기" : "이미지 미리보기"}
            </Button>
          )}
          {previewId === f.id && f.status === "READY" && (
            <FilePreview access={a} file={f} />
          )}
        </article>
      ))}
      {q.data &&
        onSelect &&
        selected
          ?.filter(
            (id) =>
              !q.data.files.some((f) => f.id === id && f.status === "READY"),
          )
          .map((id, index) => (
            <div
              key={id}
              role="alert"
              className="rounded-lg border border-field p-3"
            >
              <p>
                현재 연결할 수 없는 이전 영수증 {index + 1}입니다. 삭제되었거나
                업로드가 완료되지 않았습니다.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  onSelect(selected.filter((value) => value !== id))
                }
              >
                이 영수증 연결 선택 해제
              </Button>
            </div>
          ))}
      {q.data && !q.data.files.length && (
        <div className="py-10 text-center">
          <h3 className="text-xl font-semibold">보관된 자료가 없어요</h3>
          <p className="mt-3 text-xs text-secondary">
            영수증·이체 증빙·파일을 올려 행사별로 모아둘 수 있어요.
          </p>
        </div>
      )}
      {remove && (
        <div role="alertdialog" aria-label="파일 삭제 확인">
          <p>
            {remove.name} 파일을 삭제하면 즉시 접근이 차단됩니다. 복구할 수
            없습니다.
          </p>
          <Button
            disabled={deletion.isPending}
            onClick={() => deletion.mutate(remove)}
          >
            삭제 확인
          </Button>
          <Button variant="outline" onClick={() => setRemove(null)}>
            취소
          </Button>
        </div>
      )}
    </section>
  );
}
