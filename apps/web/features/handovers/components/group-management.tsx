"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import {
  query,
  handoverKey,
  type Preview,
  type Accounts,
  type Receipt,
} from "../api/handovers.api";
import { invitationSchema, handoverSchema } from "../schemas/forms";
import { useCommand } from "../hooks/use-command";
import { accessLink, accessToken } from "../lib/link";
import { TransferScope } from "./scope";
export function GroupManagement({
  accountId,
  groupId,
  request,
}: {
  accountId: string;
  groupId: string;
  request: SessionRequest;
}) {
  const cache = useQueryClient();
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const preview = useQuery(
    query<Preview>(
      request,
      handoverKey(accountId, groupId),
      `/api/v1/handovers/groups/${groupId}`,
    ),
  );
  const accounts = useQuery(
    query<Accounts>(
      request,
      ["user", accountId, "group-accounts", groupId],
      `/api/v1/groups/${groupId}/accounts`,
    ),
  );
  const inviteForm = useForm({
    resolver: zodResolver(invitationSchema),
    defaultValues: { email: "" },
  });
  const transferForm = useForm({
    resolver: zodResolver(handoverSchema),
    defaultValues: { targetId: "" },
  });
  const refresh = () => {
    void preview.refetch();
    void accounts.refetch();
    void cache.invalidateQueries({ queryKey: ["user", accountId, "groups"] });
  };
  const invite = useCommand<Receipt>(request, (r, body) => {
    setLink(
      accessLink("invitation", r.id, "token" in body ? String(body.token) : ""),
    );
    setCopied(false);
    refresh();
  });
  const transfer = useCommand<Receipt>(request, (r, body) => {
    setLink(
      accessLink("handover", r.id, "token" in body ? String(body.token) : ""),
    );
    setCopied(false);
    refresh();
  });
  const cancel = useCommand<Receipt>(request, () => {
    setLink("");
    refresh();
  });
  if (isAccessError(preview.error) || isAccessError(accounts.error))
    return (
      <ErrorState
        retry={() => location.assign(new URL("/mypage", location.origin).href)}
      >
        모임 관리 권한이 없어요. 내 모임을 다시 확인해 주세요.
      </ErrorState>
    );
  if (!preview.data || !accounts.data)
    return preview.isError || accounts.isError ? (
      <ErrorState retry={refresh} />
    ) : (
      <LoadingState>모임 관리 정보 확인 중…</LoadingState>
    );
  const busy = invite.isPending || transfer.isPending || cancel.isPending;
  const unresolved = invite.uncertain || transfer.uncertain || cancel.uncertain;
  const pending = preview.data.requests.find(
    (r) =>
      r.status === "PENDING" && Date.parse(r.expiresAt) > preview.dataUpdatedAt,
  );
  return (
    <section className="mt-8 space-y-6" aria-label="계정 멤버와 인수인계">
      <div className="rounded-control bg-surface p-4">
        <h2 className="text-lg font-semibold">모임 현황 · 관리 권한</h2>
        <p>
          등록된 행사 {preview.data.scope.events}개 · 기본 명단{" "}
          {preview.data.scope.roster}명
        </p>
        <p>
          현재 총무:{" "}
          {accounts.data.accounts.find((a) => a.id === accounts.data.ownerId)
            ?.name ?? "기존 관리자"}{" "}
          · 관리자 1명
        </p>
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">로그인 계정 멤버</h2>
        <p className="text-caption text-muted">
          기본 명단과 별개예요. 가입 수락만으로 관리권한을 주지 않아요.
        </p>
        <ul>
          {accounts.data.accounts.map((a) => (
            <li key={a.id} className="py-2 break-all">
              {a.name} · {a.email} · {a.role === "ADMIN" ? "총무" : "일반 멤버"}
            </li>
          ))}
        </ul>
        <form
          className="mt-3 space-y-2"
          onSubmit={inviteForm.handleSubmit((v) => {
            const t = accessToken();
            invite.send(`/api/v1/groups/${groupId}/invitations`, {
              ...v,
              token: t,
              requestKey: crypto.randomUUID(),
            });
          })}
        >
          <label htmlFor="invite-email">초대할 총무 계정의 인증된 이메일</label>
          <Input
            id="invite-email"
            {...inviteForm.register("email")}
            aria-invalid={!!inviteForm.formState.errors.email}
            aria-describedby="invite-error"
            disabled={busy || unresolved}
          />
          <p id="invite-error" role="alert">
            {inviteForm.formState.errors.email?.message}
          </p>
          <Button type="submit" disabled={busy || unresolved}>
            참여 초대 링크 만들기
          </Button>
        </form>
        {accounts.data.invitations
          .filter(
            (r) =>
              r.status === "PENDING" &&
              Date.parse(r.expiresAt) > preview.dataUpdatedAt,
          )
          .map((r) => (
            <p key={r.id}>
              초대 수락 대기{" "}
              <Button
                variant="outline"
                disabled={busy || unresolved}
                onClick={() =>
                  cancel.send(
                    `/api/v1/groups/${groupId}/invitations/${r.id}/cancel`,
                    {},
                  )
                }
              >
                초대 취소
              </Button>
            </p>
          ))}
      </div>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">다음 총무에게 넘기기</h2>
        <p className="text-sm text-muted">
          모임 기록·명단·정산 자료와 관리 권한을 새 총무에게 넘겨요.
        </p>
        <TransferScope scope={preview.data.scope} />
        {pending ? (
          <div>
            <p>수신자가 인수인계를 수락하기 전까지 내 관리권한은 유지돼요.</p>
            <Button
              variant="outline"
              disabled={busy || unresolved}
              onClick={() =>
                cancel.send(
                  `/api/v1/handovers/groups/${groupId}/${pending.id}/cancel`,
                  {},
                )
              }
            >
              인수인계 요청 취소
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={transferForm.handleSubmit((v) => {
              const t = accessToken();
              transfer.send(`/api/v1/handovers/groups/${groupId}`, {
                ...v,
                token: t,
                expectedVersion: preview.data!.group.version,
                requestKey: crypto.randomUUID(),
              });
            })}
          >
            <label htmlFor="new-manager" className="text-caption text-muted">
              새 총무 선택
            </label>
            <select
              id="new-manager"
              {...transferForm.register("targetId")}
              disabled={busy || unresolved}
              aria-invalid={!!transferForm.formState.errors.targetId}
              aria-describedby="target-error"
              className="h-12 w-full rounded-control border border-border bg-input px-3"
            >
              <option value="">인수할 계정 멤버 선택</option>
              {accounts.data.accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.email})
                  </option>
                ))}
            </select>
            <p id="target-error" role="alert">
              {transferForm.formState.errors.targetId?.message}
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={busy || unresolved}
            >
              인수인계 요청하기
            </Button>
            <p className="text-center text-caption text-muted">
              상대가 수락한 뒤에는 내 권한이 일반 멤버로 바뀌어요.
            </p>
          </form>
        )}
      </div>
      {link && (
        <div className="space-y-2">
          <p>
            링크를 의도한 상대에게 직접 전달해 주세요. 자동 발송하지 않았어요.
            링크는 24시간 동안 유효해요.
          </p>
          <Input aria-label="공유할 링크" readOnly value={link} />
          <Button
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }
          >
            {copied ? "복사했어요" : "링크 복사"}
          </Button>
        </div>
      )}
      {[invite, transfer, cancel].map(
        (m, i) =>
          m.isError && (
            <ErrorState key={i} retry={m.uncertain ? m.retry : refresh}>
              {m.uncertain
                ? "처리 결과를 확인하지 못했어요. 원래 요청 그대로 다시 확인해 주세요."
                : "요청을 처리하지 못했어요. 최신 상태를 확인하고 다시 진행해 주세요."}
            </ErrorState>
          ),
      )}
      {(preview.isError || accounts.isError) && (
        <ErrorState retry={refresh}>
          최신 관리 정보를 불러오지 못했어요.
        </ErrorState>
      )}
    </section>
  );
}
