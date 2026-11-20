"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { StepLayout } from "@/shared/ui/step-layout";
import { safeErrorMessage } from "@/shared/http/error-contract";
import {
  replyQuery,
  isMerchantAccessError,
  type ReplyAccess,
} from "../api/replies.api";
import { ClosedInquiry } from "./closed-inquiry";
import { ReplyForm } from "./reply-form";
import { SubmittedReply } from "./reply-summary";
export function ReplyWorkspace({
  targetId,
  access,
  onDone,
}: {
  targetId: string;
  access: ReplyAccess;
  onDone?: () => void;
}) {
  const expiresAt =
    access.kind === "link" ? Date.parse(access.accessExpiresAt) : Infinity;
  const [denied, setDenied] = useState(false),
    [expired, setExpired] = useState(() => expiresAt <= Date.now());
  useEffect(() => {
    if (!Number.isFinite(expiresAt)) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const q = useQuery({
    ...replyQuery(targetId, access),
    enabled: (query) =>
      !denied && !expired && !isMerchantAccessError(query.state.error),
  });
  const blocked = denied || expired || isMerchantAccessError(q.error);
  const notice = isMerchantAccessError(q.error)
    ? safeErrorMessage(q.error)
    : "접근 권한이 만료됐습니다. 문자에 있는 원래 링크를 다시 열어 주세요.";
  const statusScreen = (children: ReactNode) =>
    onDone ? (
      <StepLayout title="받은 문의" onBack={onDone}>
        {children}
      </StepLayout>
    ) : (
      <main className="mx-auto max-w-[402px] px-5 py-10">{children}</main>
    );
  if (blocked) return statusScreen(<p role="alert">{notice}</p>);
  if (q.isError && !q.data)
    return statusScreen(
      <ErrorState retry={() => void q.refetch()}>
        {safeErrorMessage(q.error)}
      </ErrorState>,
    );
  if (!q.data)
    return statusScreen(<LoadingState>예약 문의 확인 중…</LoadingState>);
  if (q.data.response)
    return (
      <SubmittedReply
        response={q.data.response}
        closedState={q.data.closedState}
        onDone={onDone}
      />
    );
  if (q.data.closedState)
    return statusScreen(<ClosedInquiry state={q.data.closedState} />);
  return (
    <>
      {q.isError && (
        <div
          role="alert"
          className="mx-auto mb-4 max-w-[402px] rounded-control border border-field p-4"
        >
          <p>최신 문의를 불러오지 못했어요. 작성 중인 답변은 유지됩니다.</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void q.refetch()}
          >
            다시 확인
          </Button>
        </div>
      )}
      <ReplyForm
        inquiry={q.data}
        access={access}
        onBack={onDone}
        onAccessFailure={() => setDenied(true)}
      />
    </>
  );
}
