"use client";
import { MerchantSummary } from "@/features/calendar/client";
import { NotificationBadge } from "@/features/notifications/client";
import { OwnerNavigation } from "@/shared/ui/owner-navigation";
import { OwnerHours } from "./owner-hours";
import { OwnerReservations } from "@/features/reservation-completion/client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AuthScreen, useAuth } from "@/features/auth/client";
import type { Account, SessionRequest } from "@/features/auth/types";
import { buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { StepLayout } from "@/shared/ui/step-layout";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { contextQuery } from "../api/owner.api";
import { useBeginDraft } from "../hooks/use-owner-commands";
import type { RestaurantDraft } from "../types/owner.types";
import { OwnerRegistration } from "./owner-registration";
import { OwnerMenus } from "./owner-menus";
import { OwnerInquiries } from "./owner-inquiries";
export function OwnerScreen({
  view = "home",
}: {
  view?: "home" | "register" | "menus" | "inquiries" | "reservations" | "hours";
}) {
  const { status, account, client } = useAuth(),
    params = useSearchParams(),
    router = useRouter();
  const request = useMemo(() => client.request.bind(client), [client]);
  const reservationId = params.get("reservation") ?? undefined;
  const restaurantId = params.get("restaurant") ?? undefined,
    targetId = params.get("target") ?? undefined;
  const destination = `/owner${view === "home" ? "" : `/${view}`}${restaurantId ? `?restaurant=${encodeURIComponent(restaurantId)}` : targetId ? `?target=${encodeURIComponent(targetId)}` : reservationId ? `?reservation=${encodeURIComponent(reservationId)}` : ""}`;
  if (status === "loading")
    return (
      <main className="app-page">
        <LoadingState>계정 확인 중…</LoadingState>
      </main>
    );
  if (status === "anonymous")
    return (
      <StepLayout title="사장님 시작하기" onBack={() => router.push("/")}>
        <h1 className="text-2xl font-bold">
          매장을 등록하고 예약 문의를 받아보세요
        </h1>
        <p className="my-5 text-muted">
          새로 가입한다면 첫 설정에서 사장님을 선택해 주세요.
        </p>
        <Link
          className={buttonStyles()}
          href={`/auth?next=${encodeURIComponent(destination)}`}
        >
          사장님 계정으로 로그인
        </Link>
      </StepLayout>
    );
  if (status !== "authenticated" || !account)
    return (
      <main className="app-page">
        <AuthScreen />
      </main>
    );
  if (account.accountType !== "owner")
    return (
      <main className="app-page">
        <h1>사장님 계정으로 이용해 주세요</h1>
        <Link href="/">내 홈으로 가기</Link>
      </main>
    );
  const navigate = (path: string) => {
    if (
      client.getSnapshot().account?.id === account.id &&
      client.getSnapshot().status === "authenticated"
    )
      router.push(path);
  };
  const props = { account, request, onNavigate: navigate };
  return view === "hours" && restaurantId ? (
    <OwnerHours
      key={`${account.id}:${restaurantId}`}
      accountId={account.id}
      restaurantId={restaurantId}
      request={request}
      onBack={() => navigate("/owner")}
    />
  ) : view === "reservations" ? (
    <OwnerReservations
      key={`${account.id}:${reservationId}`}
      {...props}
      reservationId={reservationId}
    />
  ) : view === "register" ? (
    <RegistrationLoader
      key={`${account.id}:${restaurantId ?? "new"}`}
      {...props}
      restaurantId={restaurantId}
    />
  ) : view === "menus" ? (
    <OwnerMenus
      key={`${account.id}:${restaurantId}`}
      {...props}
      restaurantId={restaurantId}
    />
  ) : view === "inquiries" ? (
    <OwnerInquiries
      key={`${account.id}:${targetId}`}
      {...props}
      targetId={targetId}
    />
  ) : (
    <OwnerHome key={account.id} {...props} />
  );
}
function OwnerHome({
  account,
  request,
}: {
  account: Account;
  request: SessionRequest;
  onNavigate: (path: string) => void;
}) {
  const context = useQuery(contextQuery(account.id, request));
  const [selectedId, setSelectedId] = useState("");
  const restaurant =
    context.data?.restaurants.find((r) => r.id === selectedId) ??
    context.data?.restaurants[0];
  return (
    <main className="mx-auto flex min-h-svh max-w-[402px] flex-col px-5 pt-[max(clamp(24px,7.7svh,73px),env(safe-area-inset-top))] pb-0">
      <header className="mb-[30px] flex min-h-11 items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-xl font-semibold">
          {context.data && context.data.restaurants.length > 1 ? (
            <select
              aria-label="매장 선택"
              className="w-full bg-transparent"
              value={restaurant?.id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {context.data.restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            (restaurant?.name ?? "내 매장")
          )}
        </h1>
        <div className="-mr-1 flex shrink-0 items-center gap-1.5">
          <NotificationBadge accountId={account.id} request={request} icon />
          <Link
            href="/mypage"
            aria-label="마이페이지"
            className="flex size-11 items-center justify-center"
          >
            <Image
              src="/images/calendar/profile.svg"
              alt=""
              width={36}
              height={36}
              style={{ height: "auto" }}
            />
          </Link>
        </div>
      </header>
      {context.isError ? (
        <ErrorState retry={() => void context.refetch()} />
      ) : !context.data ? (
        <LoadingState>매장 확인 중…</LoadingState>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          {restaurant && (
            <>
              <nav aria-label="예약 업무" className="grid grid-cols-2 gap-3">
                <Link className={buttonStyles()} href="/owner/inquiries">
                  받은 문의
                </Link>
                <Link
                  className={buttonStyles({ variant: "outline" })}
                  href="/owner/reservations"
                >
                  예약 관리
                </Link>
              </nav>
              <MerchantSummary
                key={restaurant.id}
                accountId={account.id}
                restaurantId={restaurant.id}
                request={request}
              />
              <details
                id="store-settings"
                className="my-3 rounded-card bg-surface p-5 shadow-card"
              >
                <summary className="cursor-pointer font-semibold">
                  매장 정보 관리
                </summary>
                <p className="mt-3 text-sm text-secondary">
                  {restaurant.published ? "공개 중" : "공개 대기"}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link
                    className={buttonStyles({ variant: "outline" })}
                    href={`/owner/hours?restaurant=${restaurant.id}`}
                  >
                    영업시간
                  </Link>
                  <Link
                    className={buttonStyles({ variant: "outline" })}
                    href={`/owner/register?restaurant=${restaurant.id}`}
                  >
                    정보 수정
                  </Link>
                  <Link
                    className={buttonStyles({ variant: "outline" })}
                    href={`/owner/menus?restaurant=${restaurant.id}`}
                  >
                    메뉴 관리
                  </Link>
                  <Link
                    className={buttonStyles({ variant: "outline" })}
                    href="/owner/register"
                  >
                    매장 추가
                  </Link>
                </div>
              </details>
            </>
          )}
          {!context.data.restaurants.length ? (
            <section className="flex flex-1 flex-col px-[14px]">
              <Image
                src="/images/auth/brand-symbol.svg"
                alt=""
                width={84}
                height={74}
                className="mb-5 rounded-full bg-brand p-3"
              />
              <h2 className="text-2xl font-bold text-brand-ink">
                총무야에 오신 걸 환영해요!
              </h2>
              <p className="mt-2 max-w-64 text-control leading-normal text-secondary">
                {context.data.drafts.length
                  ? "작성 중인 매장 정보를 이어서 등록해 주세요."
                  : "매장을 등록해 총무들이 단체 예약을 문의할 수 있게 해주세요."}
              </p>
              <Link
                className={buttonStyles({ className: "mt-auto w-full" })}
                href="/owner/register"
              >
                {context.data.drafts.length
                  ? "매장 등록 이어쓰기"
                  : "매장 등록하기"}
              </Link>
            </section>
          ) : null}
        </div>
      )}
      <div className="h-8" />
      <OwnerNavigation current="home" restaurantId={restaurant?.id} />
    </main>
  );
}
function RegistrationLoader({
  account,
  request,
  restaurantId,
  onNavigate,
}: {
  account: Account;
  request: SessionRequest;
  restaurantId?: string;
  onNavigate: (path: string) => void;
}) {
  const begin = useBeginDraft(account.id, request),
    active = useActiveScreen();
  const [draft, setDraft] = useState<RestaurantDraft | null>(null);
  const mutate = begin.mutateAsync;
  useEffect(() => {
    void mutate(restaurantId)
      .then((r) => {
        if (active.current) setDraft(r);
      })
      .catch(() => undefined);
  }, [mutate, restaurantId, active]);
  if (draft)
    return (
      <OwnerRegistration
        account={account}
        request={request}
        draft={draft}
        onNavigate={onNavigate}
      />
    );
  return (
    <main className="app-page">
      {begin.isError ? (
        <ErrorState
          retry={() =>
            void mutate(restaurantId)
              .then((r) => {
                if (active.current) setDraft(r);
              })
              .catch(() => undefined)
          }
        />
      ) : (
        <LoadingState>등록 초안 불러오는 중…</LoadingState>
      )}
    </main>
  );
}
