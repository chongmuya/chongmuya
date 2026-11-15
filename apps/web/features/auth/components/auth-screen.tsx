"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/shared/http/api-error";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { LoadingState } from "@/shared/ui/states";
import { safeReturnPath } from "../lib/return-path";
import { useAuth } from "./auth-provider";
import { AuthRecovery } from "./auth-recovery";
import { CredentialsForm } from "./credentials-form";
import { profileQueryOptions } from "../api/auth.queries";
import { useAuthActions } from "../hooks/use-auth-actions";
import { authErrorMessage } from "../lib/auth-error-message";

export function AuthScreen() {
  const { client, status, account } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const returnTo = safeReturnPath(params?.get("next"));
  useEffect(() => {
    if (status === "authenticated" && pathname === "/auth")
      router.replace(returnTo);
  }, [status, pathname, router, returnTo]);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const { login, logout, restore, signIn } = useAuthActions();
  const pending = login.isPending || logout.isPending || restore.isPending;
  const profile = useQuery(
    profileQueryOptions(
      client,
      status === "authenticated" ? account?.id : undefined,
    ),
  );
  const error =
    status === "logout-failed"
      ? logout.error
      : status === "unavailable"
        ? restore.error
        : status === "anonymous"
          ? login.error instanceof ApiError &&
            login.error.code === "VALIDATION_FAILED"
            ? null
            : login.error
          : null;
  if (status === "loading")
    return <LoadingState>로그인 상태 확인 중…</LoadingState>;
  return (
    <section aria-label="계정">
      <h2>계정</h2>
      <FormError message={error ? authErrorMessage(error) : undefined} />
      {status === "unavailable" ||
      status === "logging-out" ||
      status === "logout-failed" ? (
        <AuthRecovery
          status={status}
          pending={pending}
          onRestore={() => restore.mutate()}
          onLogout={() => logout.mutate()}
        />
      ) : status === "authenticated" ? (
        <div>
          <p>{account?.email} 계정으로 로그인했습니다.</p>
          {profile.isError ? (
            <p role="alert">
              내 정보를 불러오지 못했습니다.{" "}
              <Button onClick={() => void profile.refetch()}>다시 확인</Button>
            </p>
          ) : (
            profile.data && <p>내 정보: {profile.data.email}</p>
          )}
          <Button disabled={pending} onClick={() => logout.mutate()}>
            로그아웃
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setMode("login");
                login.reset();
              }}
              disabled={pending}
            >
              로그인
            </Button>
            <Button
              onClick={() => {
                setMode("signup");
                login.reset();
              }}
              disabled={pending}
            >
              회원가입
            </Button>
          </div>
          <CredentialsForm
            mode={mode}
            pending={pending}
            submit={(values, onError) => signIn(mode, values, onError)}
          />
        </>
      )}
    </section>
  );
}
