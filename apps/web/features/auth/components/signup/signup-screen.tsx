"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { ApiError } from "@/shared/http/api-error";
import { useAuth, notifySessionChange } from "../auth-provider";
import { AuthScreen } from "../auth-screen";
import { postLoginPath, firstSetupPath } from "../../lib/first-setup";
import { safeReturnPath } from "../../lib/return-path";
import { authEntryPath } from "../../lib/auth-entry-path";
import {
  phoneVerificationActions,
  emailVerificationActions,
  signupTermsOptions,
} from "../../api/signup.api";
import type { SignupRequest } from "../../types/signup.types";
import { SignupFlow } from "./signup-flow";

export function SignupScreen() {
  const params = useSearchParams();
  const returnTo = safeReturnPath(params.get("next"));
  return <SignupScreenContent key={returnTo} returnTo={returnTo} />;
}
function SignupScreenContent({ returnTo }: { returnTo: string }) {
  const { client, status, account } = useAuth();
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<string | null>(null);
  const active = useRef(true);
  const input = useRef<{ values: SignupRequest; signal: AbortSignal } | null>(
    null,
  );
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      input.current = null;
    };
  }, []);
  const terms = useQuery(signupTermsOptions(client.request.bind(client)));
  const signup = useMutation({
    mutationFn: async () => {
      const current = input.current;
      input.current = null;
      if (!current) throw new Error("Missing signup input");
      const identity = await client.signup(current.values, current.signal);
      if (!active.current || current.signal.aborted)
        throw new Error("Signup cancelled");
      setCreatedAccount(identity.id);
      notifySessionChange();
      // Do not return credentials or the verification ID into Query's cache.
    },
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    if (
      status === "authenticated" &&
      !completing &&
      createdAccount !== account?.id
    )
      router.replace(postLoginPath(account!, returnTo));
  }, [status, completing, createdAccount, account, returnTo, router]);
  if (
    status === "loading" ||
    (status === "authenticated" &&
      !completing &&
      createdAccount !== account?.id)
  )
    return (
      <main className="app-page">
        <LoadingState>로그인 상태 확인 중…</LoadingState>
      </main>
    );
  if (status !== "anonymous" && status !== "authenticated")
    return (
      <main className="app-page">
        <AuthScreen />
      </main>
    );
  if (terms.isError && !terms.data)
    return (
      <main className="app-page">
        <p role="alert">{safeErrorMessage(terms.error)}</p>
        <Button onClick={() => void terms.refetch()}>
          가입 약관 다시 불러오기
        </Button>
      </main>
    );
  if (!terms.data)
    return (
      <main className="app-page">
        <LoadingState>가입 정보를 준비하고 있어요…</LoadingState>
      </main>
    );
  return (
    <>
      {terms.isError && (
        <aside
          role="alert"
          className="mx-auto max-w-[402px] px-5 pt-4 text-caption"
        >
          <p>약관을 새로 확인하지 못했어요. 입력한 정보는 유지됩니다.</p>
          <Button variant="outline" onClick={() => void terms.refetch()}>
            약관 다시 확인
          </Button>
        </aside>
      )}
      <SignupFlow
        terms={terms.data}
        verification={{
          email: emailVerificationActions(
            client.request.bind(client),
            client.prepareSignup,
          ),
          phone: phoneVerificationActions(
            client.request.bind(client),
            client.prepareSignup,
          ),
        }}
        onExit={() => router.push(authEntryPath("/start", returnTo))}
        onComplete={() => {
          if (
            client.getSnapshot().status === "authenticated" &&
            client.getSnapshot().account?.id === createdAccount
          )
            router.replace(firstSetupPath(returnTo));
        }}
        onSubmit={async (values, signal) => {
          setCompleting(true);
          input.current = { values, signal };
          try {
            await signup.mutateAsync();
          } catch (error) {
            if (
              error instanceof ApiError &&
              error.code === "SIGNUP_TERMS_CHANGED"
            )
              void terms.refetch();
            throw error;
          } finally {
            if (active.current) setCompleting(false);
          }
        }}
      />
    </>
  );
}
