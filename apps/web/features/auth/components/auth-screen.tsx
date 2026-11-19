"use client";

import Link from "next/link";
import { authEntryPath } from "../lib/auth-entry-path";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { LoadingState } from "@/shared/ui/states";
import { safeReturnPath } from "../lib/return-path";
import { useAuth } from "./auth-provider";
import { AuthRecovery } from "./auth-recovery";
import { profileQueryOptions } from "../api/auth.queries";
import { useAuthActions } from "../hooks/use-auth-actions";
import { authErrorMessage } from "../lib/auth-error-message";

export function AuthScreen() {
  const { client, status, account } = useAuth();
  const params = useSearchParams();
  const returnTo = safeReturnPath(params?.get("next"));
  const { logout, restore } = useAuthActions();
  const pending = logout.isPending || restore.isPending;
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
        : null;
  if (status === "loading")
    return <LoadingState>로그인 상태 확인 중…</LoadingState>;
  return (
    <section aria-label="계정">
      <h2 className="text-xl font-semibold">계정 정보</h2>
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
          {profile.isError ? (
            <p role="alert">
              내 정보를 불러오지 못했습니다.{" "}
              <Button onClick={() => void profile.refetch()}>다시 확인</Button>
            </p>
          ) : (
            <p className="my-5 break-all">
              {profile.data?.email ?? account?.email}
            </p>
          )}
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => logout.mutate()}
          >
            로그아웃
          </Button>
        </div>
      ) : (
        <>
          <Link href={authEntryPath("/auth/signup", returnTo)}>회원가입</Link>
          <Link href={authEntryPath("/auth", returnTo)}>로그인</Link>
        </>
      )}
    </section>
  );
}
