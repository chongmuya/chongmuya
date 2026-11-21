"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { notifySessionChange, useAuth } from "@/features/auth/client";
import { ApiError } from "@/shared/http/api-error";
import { Button, buttonStyles } from "@/shared/ui/button";
import { ChoiceCard } from "@/shared/ui/choice-card";
import { Dialog } from "@/shared/ui/dialog";
import { MenuLink } from "@/shared/ui/menu-link";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import type { WithdrawalStatus } from "../api/withdrawal.api";
import {
  useWithdrawal,
  useWithdrawalReceipt,
} from "../hooks/use-account-withdrawal";

const back = "/mypage";
const login = "/start?next=%2Fmypage%2Fwithdrawal";
const reasons = [
  "해당 날짜 단체 예약 마감",
  "원하는 기능이 없어요",
  "쓰기가 불편해요",
  "개인정보가 걱정돼요",
  "기타",
];
const outline =
  "border-2 text-[color-mix(in_srgb,var(--color-brand),black_26%)]";
const plain = "border-transparent bg-transparent text-secondary";
const dataRows = [
  "내 모임 · 참석 명단",
  "예약 내역",
  "정산 · 입금 기록",
  "보관한 자료 · 영수증",
];

export function WithdrawalEntry() {
  return <MenuLink href="/mypage/withdrawal">회원 탈퇴</MenuLink>;
}

export function AccountWithdrawalScreen() {
  const { client, account, status } = useAuth();
  const router = useRouter();
  const [receipt, setReceipt] = useState<{
    accountId: string;
    key: string;
    state: "checking" | "pending" | "completed";
  } | null>(null);
  const pendingReceipt = receipt && receipt.state !== "completed";
  const processing = pendingReceipt && receipt.state === "pending";
  const successHeading = useRef<HTMLHeadingElement>(null);
  const pendingStatus = useRef<HTMLDivElement>(null);
  const showSuccess = Boolean(
    receipt?.state === "completed" &&
    (!account || account.id === receipt.accountId),
  );
  useEffect(() => {
    if (showSuccess) successHeading.current?.focus();
  }, [showSuccess]);
  useEffect(() => {
    if (processing) pendingStatus.current?.querySelector("h1")?.focus();
  }, [processing, status]);
  const onComplete = (attempt: { accountId: string; key: string }) => {
    client.endWithdrawnSession(attempt.accountId);
    notifySessionChange();
    setReceipt({ ...attempt, state: "completed" });
  };
  const onPending = (attempt: { accountId: string; key: string }) => {
    client.endWithdrawnSession(attempt.accountId);
    notifySessionChange();
    setReceipt({ ...attempt, state: "pending" });
  };
  const receiptCheck = useWithdrawalReceipt({ onComplete, onPending });
  if (showSuccess)
    return (
      <StepLayout title="" onBack={() => router.replace("/")}>
        <div className="mb-8 space-y-2">
          <h1
            ref={successHeading}
            tabIndex={-1}
            className="text-2xl font-bold text-brand-ink"
          >
            회원 탈퇴가 완료됐어요
          </h1>
          <p>
            총무야 계정의 로그인 접근을 종료하고 계정 정보를 삭제했어요. 공동
            기록과 증빙은 보존돼요.
          </p>
        </div>
        <Link
          href="/"
          className={buttonStyles({
            variant: "brand-outline",
            className: outline,
          })}
        >
          홈으로
        </Link>
      </StepLayout>
    );
  if (account)
    return (
      <WithdrawalFlow
        key={account.id}
        accountId={account.id}
        onAttempt={(key) =>
          setReceipt({ accountId: account.id, key, state: "checking" })
        }
        onComplete={(key) => onComplete({ key, accountId: account.id })}
        onPending={(key) => onPending({ key, accountId: account.id })}
      />
    );
  return (
    <StepLayout title="" onBack={() => router.push(back)}>
      {status === "loading" ? (
        <LoadingState>로그인 상태를 확인하고 있어요.</LoadingState>
      ) : status === "unavailable" ? (
        <ErrorState retry={() => void client.restore().catch(() => undefined)}>
          로그인 상태를 확인하지 못했어요.
        </ErrorState>
      ) : (
        <div ref={pendingStatus} className="space-y-4">
          <StepHeading
            title={
              processing
                ? "카카오 연결 해제를 확인하고 있어요"
                : pendingReceipt
                  ? "탈퇴 결과를 확인해 주세요"
                  : "로그인하고 이어서 진행해 주세요"
            }
            className="mb-4"
          />
          {pendingReceipt && (
            <>
              {processing && (
                <p role="status">
                  총무야 로그인은 종료됐어요. 카카오 연결 해제가 확인되면 탈퇴가
                  완료돼요.
                </p>
              )}
              <Button
                variant="brand-outline"
                className={outline}
                loading={receiptCheck.isPending}
                onClick={() =>
                  receiptCheck.mutate({
                    attempt: receipt,
                    resume: Boolean(processing),
                  })
                }
              >
                {processing ? "카카오 연결 해제 다시 확인" : "탈퇴 결과 확인"}
              </Button>
              {(receiptCheck.isError ||
                (receiptCheck.data &&
                  !receiptCheck.data.completed &&
                  !receiptCheck.data.pending)) && (
                <p role="status">
                  아직 완료 여부를 확인하지 못했어요. 다시 확인하거나 로그인해
                  주세요.
                </p>
              )}
            </>
          )}
          {!processing && (
            <Link href={login} className={buttonStyles({ variant: "outline" })}>
              로그인
            </Link>
          )}
          <p className="text-sm">
            로그인할 수 없다면{" "}
            <a
              className="text-link underline"
              href="mailto:support@chongmuya.com"
            >
              support@chongmuya.com
            </a>
            으로 문의해 주세요.
          </p>
        </div>
      )}
    </StepLayout>
  );
}

function keepDialogFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const controls = event.currentTarget.querySelectorAll<HTMLElement>(
    "a[href], button:not(:disabled)",
  );
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (
    !first ||
    (event.shiftKey
      ? event.target === first ||
        !Array.from(controls).includes(event.target as HTMLElement)
      : event.target === last)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}

function WithdrawalFlow({
  accountId,
  onAttempt,
  onComplete,
  onPending,
}: {
  accountId: string;
  onAttempt: (key: string) => void;
  onComplete: (key: string) => void;
  onPending: (key: string) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<string>();
  const initialFocus = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { status, action } = useWithdrawal(accountId, {
    onAttempt,
    onComplete,
    onPending,
    onStateChange: () => initialFocus.current?.focus(),
  });
  const current = status.data;
  const blocked = Boolean(current?.blockers.length);
  const requested = current?.request && !current.request.reviewed;
  const retry = () => {
    action.reset();
    void status.refetch();
  };
  return (
    <StepLayout
      variant="flow"
      title="회원 탈퇴"
      onBack={() => router.push(back)}
      busy={action.isPending}
    >
      <div className="flex flex-col gap-7">
        <StepHeading
          title="탈퇴하기 전에 확인해 주세요"
          description="삭제한 계정 정보는 되돌릴 수 없어요."
          className="mb-0 text-brand-ink [&_h1]:break-keep"
          descriptionClassName="mt-2 text-sm text-secondary"
        />
        <section className="space-y-3 rounded-card bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold">
            탈퇴 후에도 공동 기록은 보존돼요
          </h2>
          <ul className="space-y-2 text-sm text-secondary">
            {dataRows.map((text) => (
              <li key={text} className="flex items-center gap-3">
                <Image
                  src="/images/account-withdrawal/record-bullet.svg"
                  width={8}
                  height={8}
                  alt=""
                  className="shrink-0"
                />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
        {status.isError && !current && (
          <ErrorState retry={retry}>
            탈퇴 가능 상태를 확인하지 못했어요.
          </ErrorState>
        )}
        {status.isPending && (
          <LoadingState>탈퇴 가능 상태를 확인하고 있어요.</LoadingState>
        )}
        {blocked && current && (
          <div className="space-y-3">
            <WithdrawalNotice state={current} />
            <Button
              variant="outline"
              className="w-full text-sm"
              loading={status.isFetching}
              onClick={retry}
            >
              현재 상태 다시 확인
            </Button>
          </div>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-5 text-label">
            떠나는 이유를 알려주세요 (선택)
          </legend>
          {reasons.map((option) => (
            <ChoiceCard
              key={option}
              name="withdrawal-reason"
              checked={reason === option}
              onChange={() => setReason(option)}
              className="min-h-12 flex-row items-center gap-3 rounded-[10px] border p-[13px] text-control shadow-control"
            >
              {reason === option ? (
                <Image
                  src="/images/account-withdrawal/reason-selected.svg"
                  width={20}
                  height={20}
                  alt=""
                  className="shrink-0"
                />
              ) : (
                <span
                  aria-hidden
                  className="size-5 shrink-0 rounded-pill bg-soft"
                />
              )}
              {option}
            </ChoiceCard>
          ))}
          <p className="text-xs text-secondary">
            이유는 건너뛸 수 있고, 선택한 내용은 전송하거나 저장하지 않아요.
          </p>
        </fieldset>
      </div>
      <div className="mt-7 grid gap-2">
        <Link
          href={back}
          className={buttonStyles({
            variant: "brand-outline",
            className: outline,
          })}
        >
          돌아가기
        </Link>
        <Button
          ref={opener}
          variant="brand-outline"
          className={plain}
          disabled={!current || (status.isError && !blocked)}
          onClick={() => {
            action.reset();
            setConfirming(true);
          }}
        >
          {blocked ? "탈퇴 요청 및 안내" : "탈퇴하기"}
        </Button>
      </div>
      {confirming && current && (
        <Dialog
          labelledBy={`${id}-title`}
          describedBy={`${id}-description`}
          initialFocusRef={initialFocus}
          returnFocusRef={opener}
          className="w-full max-w-[402px]"
          busy={action.isPending}
          onClose={() => setConfirming(false)}
        >
          <div
            onKeyDown={keepDialogFocus}
            className="flex flex-col gap-7 pt-[38px] text-center"
          >
            <Image
              src="/images/account-withdrawal/warning.svg"
              width={71}
              height={64}
              alt=""
              className="self-center"
            />
            <div className="space-y-2">
              <h2
                id={`${id}-title`}
                tabIndex={-1}
                ref={initialFocus}
                className="text-2xl font-bold"
              >
                {blocked ? "지금은 탈퇴할 수 없어요" : "정말 탈퇴하시겠어요?"}
              </h2>
              <p
                id={`${id}-description`}
                className="mx-auto max-w-[272px] leading-normal break-keep text-copy/80"
              >
                {blocked
                  ? "운영팀에 탈퇴 요청을 남길 수 있어요. 요청을 접수해도 계정은 유지돼요."
                  : "로그인 접근을 종료하고 이름·이메일·연락처 등 계정 정보를 삭제해요."}
              </p>
            </div>
            <WithdrawalNotice state={current} />
            {action.isError && (
              <p role="alert" className="text-danger">
                {action.error instanceof ApiError &&
                action.error.code === "KAKAO_CONFIGURATION"
                  ? "카카오 연결 해제를 시작하지 못했어요. 잠시 후 다시 시도하거나 고객지원에 문의해 주세요."
                  : "처리 결과를 확인하지 못했어요. 같은 버튼으로 다시 시도해 주세요."}
              </p>
            )}
            <div className="grid gap-2">
              <Button
                variant="brand-outline"
                className={outline}
                loading={action.isPending}
                disabled={Boolean(blocked && requested)}
                onClick={() => action.mutate(blocked ? "request" : "complete")}
              >
                {requested && blocked
                  ? "탈퇴 요청 접수됨"
                  : blocked
                    ? "탈퇴 요청 남기기"
                    : "탈퇴하기"}
              </Button>
              <Button
                variant="brand-outline"
                className={plain}
                disabled={action.isPending}
                onClick={() => setConfirming(false)}
              >
                나가기
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </StepLayout>
  );
}

function WithdrawalNotice({ state }: { state: WithdrawalStatus }) {
  return (
    <div className="flex items-start gap-3 rounded-card bg-choice p-4 text-left text-sm leading-normal text-copy">
      <Image
        src="/images/groups/info.svg"
        width={20}
        height={20}
        alt=""
        className="shrink-0"
      />
      <div className="min-w-0 space-y-1">
        {state.blockers.length ? (
          <>
            {(state.inquiries > 0 || state.reservations > 0) && (
              <>
                <p className="font-semibold">
                  {[
                    state.reservations > 0
                      ? `진행 중인 예약 ${state.reservations}건`
                      : "",
                    state.inquiries > 0
                      ? `진행 중인 문의 ${state.inquiries}건`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  이 있어요
                </p>
                <p>문의·예약이 종료되면 탈퇴를 다시 시도할 수 있어요.</p>
              </>
            )}
            {state.blockers.includes("GROUP_OWNER") && (
              <p>현재 유일한 관리자인 모임이 있어요.</p>
            )}
            {state.blockers.includes("RESTAURANT_OWNER") && (
              <p>관리 중인 매장이 있어요.</p>
            )}
            {state.request && !state.request.reviewed && (
              <p role="status">
                탈퇴 요청이 접수됐어요. 처리 가능한 상태가 되면 직접 다시 시도해
                주세요.
              </p>
            )}
            {state.request?.reviewed && (
              <p role="status">
                운영팀이 요청을 확인했어요. 필요하면 새 요청을 남길 수 있어요.
              </p>
            )}
          </>
        ) : (
          <p>예약·정산·입금 기록과 증빙은 보존돼요.</p>
        )}
      </div>
    </div>
  );
}
