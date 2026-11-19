"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { safeErrorMessage } from "@/shared/http/error-contract";
import {
  replyQuery,
  isMerchantAccessError,
  type ReplyAccess,
} from "../api/replies.api";
import { ClosedInquiry } from "./closed-inquiry";
import { ReplyForm } from "./reply-form";
export function ReplyWorkspace({
  targetId,
  access,
}: {
  targetId: string;
  access: ReplyAccess;
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
  if (blocked) return <p role="alert">{notice}</p>;
  if (q.isError && !q.data)
    return (
      <ErrorState retry={() => void q.refetch()}>
        {safeErrorMessage(q.error)}
      </ErrorState>
    );
  if (!q.data) return <LoadingState>예약 문의 확인 중…</LoadingState>;
  if (q.data.closedState) return <ClosedInquiry state={q.data.closedState} />;
  return (
    <>
      {blocked && (
        <p role="alert" className="mb-4">
          {notice}
        </p>
      )}
      {q.isError && !blocked && (
        <div
          role="alert"
          className="mb-4 rounded-control border border-field p-4"
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
        blocked={blocked}
        onAccessFailure={() => setDenied(true)}
      />
    </>
  );
}
