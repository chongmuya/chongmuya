"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { exchangeLink, isMerchantAccessError } from "../api/replies.api";
import { ReplyWorkspace } from "./reply-workspace";
export function PublicMerchantReply() {
  const target = useSearchParams().get("target") ?? "";
  return <PublicReply key={target} targetId={target} />;
}
function PublicReply({ targetId }: { targetId: string }) {
  const raw = useRef<string | null>(null),
    [scope] = useState(() => crypto.randomUUID());
  const [access, setAccess] =
      useState<Awaited<ReturnType<typeof exchangeLink>>>(),
    [error, setError] = useState<unknown>(null),
    [attempt, setAttempt] = useState(0),
    [missingLink, setMissingLink] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    raw.current ??= new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    if (!raw.current || !/^[\da-f-]{36}$/i.test(targetId)) {
      setMissingLink(true);
      return;
    }
    void exchangeLink(targetId, raw.current, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) {
          raw.current = null;
          setAccess(r);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e);
      });
    return () => controller.abort();
  }, [targetId, attempt]);
  return (
    <main className="mx-auto min-h-svh max-w-[402px] bg-background px-5 py-10">
      {missingLink || isMerchantAccessError(error) ? (
        <p role="alert">
          {isMerchantAccessError(error)
            ? safeErrorMessage(error)
            : "문자에 있는 원래 링크를 다시 열어 주세요."}
        </p>
      ) : error ? (
        <ErrorState retry={() => setAttempt((n) => n + 1)}>
          {error instanceof Error &&
          error.message === "문자에 있는 원래 링크를 다시 열어 주세요."
            ? error.message
            : safeErrorMessage(error)}
        </ErrorState>
      ) : !access ? (
        <LoadingState>문의 링크 확인 중…</LoadingState>
      ) : (
        <ReplyWorkspace
          targetId={targetId}
          access={{
            kind: "link",
            access: access.accessToken,
            accessExpiresAt: access.accessExpiresAt,
            linkExpiresAt: access.linkExpiresAt,
            scope,
          }}
        />
      )}
    </main>
  );
}
