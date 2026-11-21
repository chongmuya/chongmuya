"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/client";
import { Button, buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { StepLayout } from "@/shared/ui/step-layout";
import {
  handoverAccessPath,
  handoverAccessPreviewQuery,
  type Receipt,
} from "../api/handovers.api";
import { useCommand } from "../hooks/use-command";
import { TransferScope } from "./scope";
import { groupHandoverEnabled } from "../lib/availability";
export function GroupAccessScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const kind = params.get("kind");
  if (kind !== "handover")
    return (
      <StepLayout
        title={kind === "invitation" ? "모임 참여 초대" : "모임 링크"}
        variant="flow"
        onBack={() => router.push("/")}
      >
        <section className="space-y-4">
          <h1 className="text-xl font-bold">
            {kind === "invitation"
              ? "모임 참여 초대가 종료됐어요."
              : "이 링크를 사용할 수 없어요."}
          </h1>
          <Link href="/" className={buttonStyles()}>
            총무야로 돌아가기
          </Link>
        </section>
      </StepLayout>
    );
  return <HandoverAccess id={params.get("id") ?? ""} />;
}
function HandoverAccess({ id }: { id: string }) {
  const { account, status, client } = useAuth();
  const token = useSyncExternalStore(
    (notify) => {
      window.addEventListener("hashchange", notify);
      return () => window.removeEventListener("hashchange", notify);
    },
    () =>
      /^[a-f0-9]{64}$/.test(location.hash.slice(1))
        ? location.hash.slice(1)
        : "",
    () => "",
  );
  return (
    <StepLayout
      title="총무 인수인계"
      variant="flow"
      onBack={() => location.assign(new URL("/mypage", location.origin).href)}
    >
      {!groupHandoverEnabled ? (
        <p>총무 인수인계는 준비 중이에요.</p>
      ) : status === "loading" ? (
        <LoadingState>확인 중…</LoadingState>
      ) : !account ? (
        <section>
          <p>
            인수인계 대상 계정으로 로그인한 뒤 원래 링크를 다시 열어 주세요.
          </p>
          <Link href="/start?next=%2Fmypage" className={buttonStyles()}>
            로그인하기
          </Link>
        </section>
      ) : !/^[0-9a-f-]{36}$/i.test(id) || !token ? (
        <ErrorState
          retry={() =>
            location.assign(new URL("/mypage", location.origin).href)
          }
        >
          유효한 인수인계 링크를 열어 주세요.
        </ErrorState>
      ) : (
        <Accept
          key={`${account.id}:${id}`}
          accountId={account.id}
          id={id}
          token={token}
          request={client.request.bind(client)}
        />
      )}
    </StepLayout>
  );
}
function Accept({
  accountId,
  id,
  token,
  request,
}: {
  accountId: string;
  id: string;
  token: string;
  request: ReturnType<typeof useAuth>["client"]["request"];
}) {
  const { client } = useAuth();
  const [done, setDone] = useState(false);
  const cache = useQueryClient();
  const base = handoverAccessPath(id);
  const preview = useQuery({
    ...handoverAccessPreviewQuery(request, accountId, id, token),
    enabled: !done,
  });
  const accept = useCommand<Receipt>(request, () => {
    setDone(true);
    void cache.cancelQueries({ queryKey: ["user", accountId] });
    cache.removeQueries({ queryKey: ["user", accountId] });
    if (preview.data?.group.id)
      client.notifyAuthorityChange(preview.data.group.id);
  });
  if (done)
    return (
      <section>
        <h1 className="text-xl font-bold">인수인계를 완료했어요</h1>
        <p>
          지난 행사·예약·정산·자료와 앞으로의 운영을 관리할 수 있어요. 새
          정산문을 만들 때 계좌를 직접 확인해 주세요.
        </p>
        <Link className={buttonStyles()} href="/mypage?view=groups">
          내 모임 확인하기
        </Link>
      </section>
    );
  if (preview.isError && !accept.uncertain)
    return (
      <ErrorState retry={() => void preview.refetch()}>
        이 링크로 요청 상태를 확인할 수 없어요. 이미 처리됐거나 만료·취소됐을 수
        있어요.
        <Link href="/mypage?view=groups" className={buttonStyles()}>
          내 모임에서 현재 역할 확인하기
        </Link>
      </ErrorState>
    );
  if (!preview.data) return <LoadingState>인수인계 확인 중…</LoadingState>;
  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold">{preview.data.group.name}</h1>
      <TransferScope scope={preview.data.scope} />
      <p>
        수락하면 내가 유일한 모임 총무가 되고 기존 총무는 일반 멤버가 돼요. 진행
        중 예약·입금·정산을 이어서 확인해 주세요.
      </p>
      <Button
        className="w-full"
        disabled={accept.isPending || accept.uncertain}
        onClick={() =>
          accept.send(`${base}/accept`, {
            token,
            expectedVersion: preview.data!.group.version,
            requestKey: crypto.randomUUID(),
          })
        }
      >
        책임과 범위를 확인하고 인수하기
      </Button>
      {accept.isError && (
        <ErrorState
          retry={accept.uncertain ? accept.retry : () => void preview.refetch()}
        >
          {accept.uncertain
            ? "응답을 확인하지 못했어요. 같은 요청으로 완료 여부를 다시 확인해 주세요."
            : "권한 또는 요청이 바뀌었어요. 최신 내용을 확인해 주세요."}
        </ErrorState>
      )}
    </section>
  );
}
