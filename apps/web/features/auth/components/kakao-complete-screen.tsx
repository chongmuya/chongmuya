"use client";
import { useState } from "react";
import type { KakaoStatus } from "../api/kakao.api";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { NoticeDialog } from "@/shared/ui/notice-dialog";
import { StepLayout, StepHeading } from "@/shared/ui/step-layout";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useAuth, notifySessionChange } from "./auth-provider";
import { KakaoButton } from "./kakao-button";
import { KakaoSignupScreen } from "./signup/signup-screen";
import { usePrivateAuthAction } from "../hooks/use-private-auth-action";
import { kakaoStatus, confirmKakaoLink, cancelKakao } from "../api/kakao.api";
import { postLoginPath } from "../lib/first-setup";
import { safeReturnPath } from "../lib/return-path";
export function KakaoCompleteScreen() {
  const { client, status, account } = useAuth();
  const params = useSearchParams(),
    router = useRouter();
  const action = usePrivateAuthAction();
  const [signupContext, setSignupContext] = useState<KakaoStatus>();
  const [dismissedError, setDismissedError] = useState<unknown>();
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
  const kind = result.data?.kind;
  const error = failure || result.error || action.error;
  const errorMessage = failure
    ? failure === "unavailable"
      ? "인증 서버에 연결하지 못했어요. 잠시 후 카카오 인증을 다시 시작해 주세요."
      : "카카오 인증이 취소되었거나 만료되었어요. 다시 시작해 주세요."
    : error
      ? safeErrorMessage(error)
      : undefined;
  return (
    <StepLayout
      title="카카오 인증"
      onBack={() => router.push("/auth")}
      busy={action.isPending}
    >
      <StepHeading
        title={
          kind === "existing"
            ? "기존 로그인 방법으로 로그인해 주세요"
            : kind === "link"
              ? "카카오 연결을 마무리해 주세요"
              : "카카오 인증"
        }
      />
      <FormError message={errorMessage} />
      {error && dismissedError !== error && (
        <NoticeDialog
          title="카카오 인증을 완료하지 못했어요"
          description={errorMessage!}
          onClose={() => setDismissedError(error)}
        >
          <Button className="w-full" onClick={() => setDismissedError(error)}>
            확인
          </Button>
        </NoticeDialog>
      )}
      {kind === "existing" ? (
        <>
          <p>
            같은 이메일의 계정이 있어요. 가입할 때 사용한 이메일 또는 카카오로
            로그인해 주세요. 다른 카카오로 교체하거나 계정을 합칠 수는 없습니다.
          </p>
          <Link
            href={`/auth?next=${encodeURIComponent(safeReturnPath(result.data?.next))}`}
          >
            기존 계정으로 로그인
          </Link>
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
            <KakaoButton returnTo={result.data?.next ?? "/"} />
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
