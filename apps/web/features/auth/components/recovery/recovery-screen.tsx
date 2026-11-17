"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authEntryPath } from "../../lib/auth-entry-path";
import { safeReturnPath } from "../../lib/return-path";
import { ApiError } from "@/shared/http/api-error";
import { useAuth, notifySessionChange } from "../auth-provider";
import {
  requestPasswordReset,
  checkPasswordReset,
  savePasswordReset,
} from "../../api/password-reset.api";
import {
  RecoveryEmail,
  RecoveryPassword,
  type RecoveryLinkState,
} from "./password-recovery";
export function RecoveryScreen({ reset = false }: { reset?: boolean }) {
  const { client } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [next] = useState(() => safeReturnPath(params.get("next")));
  const loginHref = authEntryPath("/auth", next);
  const recoveryHref = authEntryPath("/auth/recovery", next);
  const token = useRef<string | null>(null);
  const [state, setState] = useState<RecoveryLinkState>("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!reset) return;
    // Read once into this mounted screen only. Never put the link in Query or storage.
    if (token.current === null) {
      token.current =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(
        window.history.state,
        "",
        authEntryPath("/auth/reset-password", next),
      );
    }
    const controller = new AbortController();
    void checkPasswordReset(
      client.request.bind(client),
      token.current,
      controller.signal,
    )
      .then(() => {
        if (!controller.signal.aborted) setState("valid");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState(
            error instanceof ApiError &&
              ["PASSWORD_RESET_INVALID", "VALIDATION_FAILED"].includes(
                error.code,
              )
              ? "expired"
              : "error",
          );
      });
    return () => controller.abort();
  }, [client, reset, attempt, next]);
  return reset ? (
    <RecoveryPassword
      loginHref={loginHref}
      linkState={state}
      onBack={() => router.push(recoveryHref)}
      onRetry={() => {
        if (state === "error") {
          setState("checking");
          setAttempt((value) => value + 1);
        } else router.push(recoveryHref);
      }}
      onSubmit={async (values, signal) => {
        await savePasswordReset(
          client.request.bind(client),
          token.current ?? "",
          values.password,
          signal,
        );
        token.current = "";
        notifySessionChange();
        // Restore checks the actual cookie owner; resetting A must not log out B.
        void client.restore().catch(() => undefined);
      }}
    />
  ) : (
    <RecoveryEmail
      loginHref={loginHref}
      onBack={() => router.push(loginHref)}
      onRequest={(email, signal) =>
        requestPasswordReset(client.request.bind(client), email, signal, next)
      }
    />
  );
}
