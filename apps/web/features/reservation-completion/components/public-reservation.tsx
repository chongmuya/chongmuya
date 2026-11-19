"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { requestJson } from "@/shared/http/request";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import type { CompletionAccess } from "../types/completion.types";
import { CompletionWorkspace } from "./completion-workspace";
export function PublicReservation() {
  const id = useSearchParams().get("reservation") ?? "";
  return <PublicAccess key={id} id={id} />;
}
function PublicAccess({ id }: { id: string }) {
  const raw = useRef<string | null>(null),
    [scope] = useState(() => crypto.randomUUID()),
    [access, setAccess] = useState<CompletionAccess | null>(null),
    [error, setError] = useState<unknown>(null),
    [attempt, setAttempt] = useState(0),
    [missing, setMissing] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    raw.current ??= new URLSearchParams(location.hash.slice(1)).get("token");
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    if (!raw.current || !/^[\da-f-]{36}$/i.test(id)) {
      setMissing(true);
      setError(
        new Error("문자에 있는 원래 예약 관리 링크를 다시 열어 주세요."),
      );
      return;
    }
    void requestJson<{ accessToken: string; accessExpiresAt: string }>(
      `/api/v1/reservation-management/${id}/access`,
      {
        method: "POST",
        body: JSON.stringify({ token: raw.current }),
        signal: abort.signal,
      },
    )
      .then((r) => {
        if (!abort.signal.aborted) {
          raw.current = null;
          setAccess({
            kind: "link",
            scope,
            access: r.accessToken,
            accessExpiresAt: r.accessExpiresAt,
          });
          setError(null);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e);
      });
    return () => abort.abort();
  }, [id, scope, attempt]);
  return (
    <main className="mx-auto min-h-svh max-w-[402px] px-5 pt-8 pb-[max(32px,env(safe-area-inset-bottom))]">
      <Image
        src="/images/auth/brand-wordmark-orange.svg"
        alt="총무야"
        width={91}
        height={32}
      />
      {access ? (
        <CompletionWorkspace id={id} access={access} />
      ) : error ? (
        <ErrorState retry={() => setAttempt((n) => n + 1)}>
          {missing
            ? "문자에 있는 원래 예약 관리 링크를 다시 열어 주세요."
            : safeErrorMessage(error)}
        </ErrorState>
      ) : (
        <LoadingState>예약 관리 링크 확인 중…</LoadingState>
      )}
    </main>
  );
}
