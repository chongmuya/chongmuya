"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuthScreen,
  firstSetupPath,
  isFirstSetupComplete,
  useAuth,
} from "@/features/auth/client";
import { buttonStyles } from "@/shared/ui/button";
import { LoadingState } from "@/shared/ui/states";
import { GroupRegistration } from "./group-registration";

export function GroupRegistrationScreen() {
  const { status, account, client } = useAuth();
  const router = useRouter();
  if (status === "loading")
    return (
      <main className="app-page">
        <LoadingState>로그인 상태 확인 중…</LoadingState>
      </main>
    );
  if (status === "anonymous")
    return (
      <main className="app-page">
        <h1>로그인하고 모임을 만들어 주세요</h1>
        <Link href="/auth?next=%2Fgroups%2Fnew" className={buttonStyles()}>
          로그인
        </Link>
        <p>
          <Link href="/">홈으로 가기</Link>
        </p>
      </main>
    );
  if (status !== "authenticated" || !account)
    return (
      <main className="app-page">
        <AuthScreen />
      </main>
    );
  if (!isFirstSetupComplete(account))
    return (
      <main className="app-page">
        <h1>첫 설정을 이어서 진행해 주세요</h1>
        <Link href={firstSetupPath("/groups/new")} className={buttonStyles()}>
          첫 설정 이어서 하기
        </Link>
      </main>
    );
  if (account.accountType === "owner")
    return (
      <main className="app-page">
        <h1>매장 등록은 준비 중이에요</h1>
        <p>사장님은 총무용 모임이나 명단을 등록하지 않아도 돼요.</p>
        <Link href="/">홈으로 가기</Link>
      </main>
    );
  return (
    <GroupRegistration
      key={account.id}
      accountId={account.id}
      request={client.request.bind(client)}
      onNavigate={(path) => {
        const current = client.getSnapshot();
        if (
          current.status === "authenticated" &&
          current.account?.id === account.id
        )
          router.push(path);
      }}
    />
  );
}
