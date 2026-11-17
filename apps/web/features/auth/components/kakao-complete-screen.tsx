"use client";
import { useState } from "react";
import type { KakaoStatus } from "../api/kakao.api";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { StepLayout, StepHeading } from "@/shared/ui/step-layout";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useAuth, notifySessionChange } from "./auth-provider";
import { KakaoButton } from "./kakao-button";
import { KakaoSignupScreen } from "./signup/signup-screen";
import { usePrivateAuthAction } from "../hooks/use-private-auth-action";
import { kakaoStatus, confirmKakaoLink, cancelKakao } from "../api/kakao.api";
import { postLoginPath } from "../lib/first-setup";
export function KakaoCompleteScreen() {
  return <KakaoCompletion />;
}
function KakaoCompletion() {
  const { client, status, account } = useAuth();
  const params = useSearchParams(),
    router = useRouter();
  const action = usePrivateAuthAction();
  const [signupContext, setSignupContext] = useState<KakaoStatus>();
  const failure = params.get("failure");
  const result = useQuery({
    queryKey: ["user", account?.id ?? "anonymous", "kakao-result"],
    queryFn: ({ signal }) => kakaoStatus(client.request.bind(client), signal),
    enabled: status !== "loading" && !failure && !signupContext,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!signupContext && result.data?.kind === "signup")
    setSignupContext(result.data);
  if (signupContext) return <KakaoSignupScreen context={signupContext} />;
  if (status === "loading" || (!failure && result.isPending))
    return (
      <main className="app-page">
        <p role="status">카카오 인증을 확인하고 있어요…</p>
      </main>
    );
  if (!failure && result.data?.kind === "signup" && status === "anonymous")
    return <KakaoSignupScreen context={result.data} />;
  const kind = result.data?.kind;
  return (
    <StepLayout
      title="카카오 인증"
      onBack={() => router.push("/auth")}
      busy={action.isPending}
    >
      <StepHeading
        title={
          kind === "existing"
            ? "기존 계정에 카카오를 연결해 주세요"
            : kind === "link"
              ? "카카오 연결을 마무리해 주세요"
              : "카카오 인증"
        }
      />
      <FormError
        message={
          failure
            ? failure === "unavailable"
              ? "인증 서버에 연결하지 못했어요. 잠시 후 카카오 인증을 다시 시작해 주세요."
              : "유효하지 않거나 만료된 카카오 인증입니다. 다시 시작해 주세요."
            : result.error
              ? safeErrorMessage(result.error)
              : action.error
                ? safeErrorMessage(action.error)
                : undefined
        }
      />
      {kind === "existing" ? (
        <>
          <p>
            같은 이메일의 계정이 있어요. 기존 계정으로 로그인한 뒤
            마이페이지에서 비밀번호 확인과 카카오 인증을 거쳐 연결할 수
            있습니다.
          </p>
          <Link href="/auth?next=%2Fmypage">기존 계정으로 로그인</Link>
          <Link href="/auth/recovery">비밀번호 재설정</Link>
        </>
      ) : !failure && !result.error && (kind === "login" || kind === "link") ? (
        <>
          <p>
            {kind === "link"
              ? "현재 로그인된 계정에 연결합니다. 계정과 기존 모임·행사 정보는 그대로 유지됩니다."
              : "인증한 카카오로 총무야 로그인을 완료해 주세요."}
          </p>
          <Button
            loading={action.isPending}
            onClick={() =>
              action.run(async (signal) => {
                if (kind === "link") {
                  await confirmKakaoLink(client.request.bind(client), signal);
                  if (
                    !signal.aborted &&
                    client.getSnapshot().account?.id === account?.id
                  )
                    router.replace("/mypage");
                } else {
                  const identity = await client.kakaoLogin(signal);
                  if (
                    !signal.aborted &&
                    client.getSnapshot().account?.id === identity.id
                  ) {
                    notifySessionChange();
                    router.replace(postLoginPath(identity, result.data!.next));
                  }
                }
              })
            }
          >
            {kind === "link" ? "연결 완료하기" : "로그인 완료하기"}
          </Button>
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() =>
              action.run(async (signal) => {
                await cancelKakao(client.request.bind(client), result.data!.id);
                if (!signal.aborted)
                  router.replace(kind === "link" ? "/mypage" : "/auth");
              })
            }
          >
            취소
          </Button>
        </>
      ) : (
        <>
          {status === "anonymous" ? (
            <KakaoButton returnTo="/events" />
          ) : (
            <Link href="/mypage">마이페이지에서 다시 연결</Link>
          )}
          {!failure && (
            <Button variant="outline" onClick={() => void result.refetch()}>
              결과 다시 확인
            </Button>
          )}
          <Link href="/auth">이메일 로그인</Link>
        </>
      )}
    </StepLayout>
  );
}
