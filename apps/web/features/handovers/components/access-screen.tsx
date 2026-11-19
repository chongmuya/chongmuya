"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/client";
import { Button, buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { StepLayout } from "@/shared/ui/step-layout";
import { command, type Preview, type Receipt } from "../api/handovers.api";
import { useCommand } from "../hooks/use-command";
import { TransferScope } from "./scope";
export function GroupAccessScreen() {
  const { account, status, client } = useAuth();
  const params = useSearchParams();
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
  const id = params.get("id") ?? "",
    kind = params.get("kind");
  return (
    <StepLayout
      title={kind === "handover" ? "총무 인수인계 수락" : "모임 참여 수락"}
      variant="flow"
      onBack={() => location.assign(new URL("/mypage", location.origin).href)}
    >
      {status === "loading" ? (
        <LoadingState>확인 중…</LoadingState>
      ) : !account ? (
        <section>
          <p>의도한 초대 계정으로 로그인한 뒤 원래 링크를 다시 열어 주세요.</p>
          <Link href="/start?next=%2Fmypage" className={buttonStyles()}>
            로그인하기
          </Link>
        </section>
      ) : !["invitation", "handover"].includes(kind ?? "") ||
        !/^[0-9a-f-]{36}$/i.test(id) ||
        !token ? (
        <ErrorState
          retry={() =>
            location.assign(new URL("/mypage", location.origin).href)
          }
        >
          유효한 초대 또는 인수인계 링크를 열어 주세요.
        </ErrorState>
      ) : (
        <Accept
          key={`${account.id}:${id}:${kind}`}
          accountId={account.id}
          id={id}
          kind={kind as "invitation" | "handover"}
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
  kind,
  token,
  request,
}: {
  accountId: string;
  id: string;
  kind: "invitation" | "handover";
  token: string;
  request: ReturnType<typeof useAuth>["client"]["request"];
}) {
  const { client } = useAuth();
  const [done, setDone] = useState(false);
  const cache = useQueryClient();
  const base =
    kind === "handover"
      ? (`/api/v1/handovers/${id}` as const)
      : (`/api/v1/groups/invitations/${id}` as const);
  const body = useMemo(() => ({ token }), [token]);
  const preview = useQuery({
    queryKey: ["user", accountId, "group-access", kind, id],
    queryFn: () =>
      command<Preview & { groupName?: string; status?: string }>(
        request,
        `${base}/preview`,
        body,
      ),
    retry: false,
    enabled: !done,
    staleTime: 0,
  });
  const accept = useCommand<Receipt>(request, () => {
    setDone(true);
    void cache.cancelQueries({ queryKey: ["user", accountId] });
    cache.removeQueries({ queryKey: ["user", accountId] });
    client.notifyAuthorityChange();
  });
  if (done)
    return (
      <section>
        <h1 className="text-xl font-bold">
          {kind === "handover"
            ? "인수인계를 완료했어요"
            : "모임 참여를 완료했어요"}
        </h1>
        <p>
          {kind === "handover"
            ? "지난 행사·예약·정산·자료와 앞으로의 운영을 관리할 수 있어요. 새 정산문을 만들 때 계좌를 직접 확인해 주세요."
            : "일반 멤버로 참여했어요. 명단·정산·자료 관리 권한은 포함되지 않아요."}
        </p>
        <Link className={buttonStyles()} href="/mypage?view=groups">
          내 모임 확인하기
        </Link>
      </section>
    );
  if (preview.isError && !accept.uncertain)
    return (
      <ErrorState retry={() => void preview.refetch()}>
        요청이 만료·취소됐거나 이 계정의 요청이 아니에요. 관리권한은 변경되지
        않았어요.
      </ErrorState>
    );
  if (!preview.data) return <LoadingState>초대 확인 중…</LoadingState>;
  if (preview.data.status === "ACCEPTED")
    return (
      <p>
        이미 수락한 참여 초대예요. <Link href="/mypage">내 모임 보기</Link>
      </p>
    );
  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold">
        {preview.data.group?.name ?? preview.data.groupName}
      </h1>
      {kind === "handover" ? (
        <>
          <TransferScope scope={preview.data.scope} />
          <p>
            수락하면 내가 유일한 모임 총무가 되고 기존 총무는 일반 멤버가 돼요.
            진행 중 예약·입금·정산을 이어서 확인해 주세요.
          </p>
        </>
      ) : (
        <p>
          모임의 로그인 계정 멤버로 참여해요. 기본 명단과 자동 연결되지 않으며
          총무 권한은 별도의 인수인계 수락이 필요해요.
        </p>
      )}
      <Button
        className="w-full"
        disabled={accept.isPending || accept.uncertain}
        onClick={() =>
          accept.send(`${base}/accept`, {
            token,
            ...(kind === "handover"
              ? {
                  expectedVersion: preview.data!.group.version,
                  requestKey: crypto.randomUUID(),
                }
              : {}),
          })
        }
      >
        {kind === "handover"
          ? "책임과 범위를 확인하고 인수하기"
          : "일반 멤버로 참여하기"}
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
