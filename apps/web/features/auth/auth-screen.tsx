"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/shared/http/api-error";
import { notifySessionChange, useAuth } from "./auth-provider";
import { AuthRecovery } from "./auth-recovery";
import type { Account } from "./session";

export function AuthScreen({ onboarding = false }: { onboarding?: boolean }) {
  const { client, status, account } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const profile = useQuery({
    queryKey: ["user", account?.id, "profile"],
    queryFn: ({ signal }) =>
      client.request<Account>("/api/v1/auth/me", { signal }),
    enabled: status === "authenticated",
    retry: false,
  });
  async function act(action: () => Promise<void>) {
    setPending(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.code === "INVALID_CREDENTIALS"
          ? "이메일 또는 비밀번호를 확인해 주세요."
          : error instanceof ApiError && error.status === 429
            ? "시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요."
            : error instanceof ApiError && error.status === 409
              ? "이미 가입한 이메일입니다."
              : "요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }
  if (status === "loading") return <p role="status">로그인 상태 확인 중…</p>;
  return (
    <section aria-label="계정">
      <h2>{onboarding ? "가입 완료 · 다음 단계" : "계정"}</h2>
      {message && <p role="alert">{message}</p>}
      {status === "unavailable" ||
      status === "logging-out" ||
      status === "logout-failed" ? (
        <AuthRecovery
          status={status}
          pending={pending}
          onRestore={() => void act(() => client.restore())}
          onLogout={() =>
            void act(async () => {
              await client.logout();
              notifySessionChange();
              router.refresh();
            })
          }
        />
      ) : status === "authenticated" ? (
        <div>
          <p>{account?.email} 계정으로 로그인했습니다.</p>
          {profile.isError && (
            <p role="alert">
              내 정보를 불러오지 못했습니다.{" "}
              <button onClick={() => void profile.refetch()}>다시 확인</button>
            </p>
          )}
          {profile.data && <p>내 정보: {profile.data.email}</p>}
          {onboarding && (
            <p>
              모임 생성은 다음 개발 단계에서 제공됩니다. 계정 가입은
              완료되었습니다.
            </p>
          )}
          <button
            disabled={pending}
            onClick={() =>
              void act(async () => {
                await client.logout();
                notifySessionChange();
                router.refresh();
              })
            }
          >
            로그아웃
          </button>
        </div>
      ) : (
        <>
          <div>
            <button onClick={() => setMode("login")} disabled={pending}>
              로그인
            </button>{" "}
            <button onClick={() => setMode("signup")} disabled={pending}>
              회원가입
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void act(async () => {
                await client.login(
                  mode,
                  String(form.get("email")),
                  String(form.get("password")),
                );
                notifySessionChange();
                if (mode === "signup") router.push("/onboarding");
                router.refresh();
              });
            }}
          >
            <p>
              <label htmlFor="email">이메일</label>
              <br />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={pending}
              />
            </p>
            <p>
              <label htmlFor="password">비밀번호 (12~128자)</label>
              <br />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={12}
                maxLength={128}
                disabled={pending}
              />
            </p>
            <button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "처리 중…" : mode === "signup" ? "가입하기" : "로그인"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
