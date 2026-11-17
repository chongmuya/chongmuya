"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { SignupFlow } from "../signup/signup-flow";
import {
  RecoveryEmail,
  RecoveryPassword,
  type RecoveryLinkState,
} from "../recovery/password-recovery";
import {
  previewTerms,
  previewSubmission,
  previewVerification,
  type PreviewOutcome,
  type PreviewVerification,
} from "./preview-fixtures";

export function AuthPreviewScreen() {
  const [screen, setScreen] = useState<"signup" | "email" | "password">(
    "signup",
  );
  const [revision, setRevision] = useState(0);
  const [outcome, setOutcome] = useState<PreviewOutcome>("success");
  const [verification, setVerification] =
    useState<PreviewVerification>("pending");
  const [linkState, setLinkState] = useState<RecoveryLinkState>("valid");
  if (process.env.NODE_ENV !== "development") return null;
  const restart = () => setRevision((current) => current + 1);
  const exit = () => {
    setScreen("signup");
    restart();
  };
  return (
    <>
      <aside
        aria-label="개발 미리보기 설정"
        className="mx-auto max-w-[402px] border-b border-border bg-surface p-3 text-caption xl:fixed xl:top-4 xl:left-4 xl:w-64"
      >
        <details>
          <summary className="cursor-pointer font-semibold">
            개발 미리보기 · 실제 가입·발송 없음
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              가상 결과를 선택한 뒤 화면에서 요청하세요. 입력은 새로고침 시
              사라집니다. 실제 개인정보는 입력하지 마세요.
            </p>
            <nav className="flex flex-wrap gap-2" aria-label="미리보기 화면">
              <Button
                variant="outline"
                onClick={() => {
                  setScreen("signup");
                  restart();
                }}
              >
                회원가입
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setScreen("email");
                  restart();
                }}
              >
                재설정 메일
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setScreen("password");
                  restart();
                }}
              >
                새 비밀번호
              </Button>
            </nav>
            <label className="block">
              가입·메일·변경 결과
              <select
                className="mt-1 block w-full rounded-control border border-input bg-surface p-2"
                value={outcome}
                onChange={(event) =>
                  setOutcome(event.target.value as PreviewOutcome)
                }
              >
                <option value="success">성공 fixture</option>
                <option value="error">네트워크 오류 fixture</option>
              </select>
            </label>
            <label className="block">
              다음 인증 요청·확인 결과
              <select
                className="mt-1 block w-full rounded-control border border-input bg-surface p-2"
                value={verification}
                onChange={(event) =>
                  setVerification(event.target.value as PreviewVerification)
                }
              >
                <option value="pending">인증 진행</option>
                <option value="verified">인증 완료</option>
                <option value="error">인증 오류</option>
                <option value="expired">인증 만료</option>
              </select>
            </label>
            <label className="block">
              재설정 링크 상태
              <select
                className="mt-1 block w-full rounded-control border border-input bg-surface p-2"
                value={linkState}
                onChange={(event) => {
                  setLinkState(event.target.value as RecoveryLinkState);
                  restart();
                }}
              >
                <option value="valid">유효한 링크 fixture</option>
                <option value="checking">확인 중</option>
                <option value="expired">만료</option>
                <option value="error">오류</option>
              </select>
            </label>
            <Button variant="outline" onClick={restart}>
              입력 초기화
            </Button>
            <Link href="/auth" className="block text-link underline">
              기존 로그인으로 이동
            </Link>
          </div>
        </details>
      </aside>
      {screen === "signup" && (
        <SignupFlow
          key={`signup:${revision}`}
          terms={previewTerms}
          onExit={exit}
          onComplete={exit}
          onSubmit={(_values, signal) => previewSubmission(outcome, signal)}
          verification={{
            phone: previewVerification(verification),
            email: previewVerification(verification),
          }}
        />
      )}
      {screen === "email" && (
        <RecoveryEmail
          key={`email:${revision}`}
          onBack={exit}
          onRequest={(_email, signal) => previewSubmission(outcome, signal)}
        />
      )}
      {screen === "password" && (
        <RecoveryPassword
          key={`password:${revision}:${linkState}`}
          linkState={linkState}
          onBack={exit}
          onRetry={() => setScreen("email")}
          onSubmit={(_values, signal) => previewSubmission(outcome, signal)}
        />
      )}
    </>
  );
}
