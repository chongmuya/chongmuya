import { useState, type ReactNode } from "react";
import Image from "next/image";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import { won } from "../lib/agreement-labels";
import type { Guidance } from "../types/completion.types";

const supportHref = `mailto:support@chongmuya.com?subject=${encodeURIComponent("예약금 안내 문의")}`;

export function MenuDeposit({
  guidance,
  ready,
  children,
}: {
  guidance: Guidance;
  ready: boolean;
  children?: ReactNode;
}) {
  const { kind, channel, amount, deadline, policy } = guidance;
  return (
    <section className="space-y-5 rounded-control bg-surface p-5 shadow-card">
      <h3 className="text-base font-medium">예약금 송금 정보</h3>
      {kind === "NONE" ? (
        <p className="rounded-control bg-soft px-4 py-3 text-sm">
          예약금이 없어요. 주문 메뉴만 보내면 돼요.
        </p>
      ) : !ready ? (
        <div className="space-y-3 py-5 text-center">
          <Image
            src="/images/reservations/menu-payment-clock.svg"
            width={44.5}
            height={44.5}
            alt=""
            className="mx-auto size-[44.5px]"
          />
          <p className="text-xl leading-tight font-semibold break-keep">
            예약금 정보를 준비하고 있어요
          </p>
          <p className="text-xs leading-relaxed break-keep text-muted">
            {kind === "REQUIRED" && amount != null && (
              <>예약금 {won(amount)} · </>
            )}
            {kind === "UNKNOWN"
              ? "메뉴를 먼저 보내 주세요. 예약금이 필요한 경우 확인 후 문자로 안내해 드려요."
              : "메뉴를 먼저 보내 주세요. 계좌와 입금 기한을 확인한 뒤 문자로 안내해 드려요."}
          </p>
          <a
            href={supportHref}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline"
          >
            운영자에게 문의하기
          </a>
        </div>
      ) : channel === "WEB" ? (
        <AccountCard key={guidance.revision} guidance={guidance} />
      ) : (
        <div className="space-y-1 rounded-control bg-soft px-4 py-3 text-sm">
          <p className="font-semibold">
            예약금 {won(amount)} · 문자로 계좌 안내
          </p>
          <p className="text-xs text-muted">
            문자를 받지 못했다면{" "}
            <a href={supportHref} className="font-semibold text-link underline">
              운영자에게 문의해 주세요.
            </a>
          </p>
        </div>
      )}
      {ready && kind === "REQUIRED" && deadline && (
        <p className="text-xs text-muted">
          입금 기한 <time dateTime={deadline}>{koreanDateLabel(deadline)}</time>
        </p>
      )}
      {children}
      {policy && policy !== "미확인" && (
        <dl className="space-y-1 border-t border-placeholder pt-4 text-xs">
          <dt className="font-medium text-muted">변경·취소·환불 조건</dt>
          <dd className="wrap-anywhere whitespace-pre-wrap">{policy}</dd>
        </dl>
      )}
    </section>
  );
}

function AccountCard({ guidance }: { guidance: Guidance }) {
  const [copyMessage, setCopyMessage] = useState("");
  const { bank, account, holder, amount } = guidance;
  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(account);
      setCopyMessage("계좌번호를 복사했어요.");
    } catch {
      setCopyMessage("복사하지 못했어요. 계좌번호를 직접 선택해 주세요.");
    }
  }
  return (
    <div className="space-y-3 rounded-control bg-[radial-gradient(ellipse_at_right_bottom,#ffdd99_0%,#fcbe7b_21%,#f99f5e_42%,#f78141_63%,#f46224_84%)] px-5 pt-6 pb-4 text-white">
      <p className="text-xs leading-tight">예약금 {won(amount)}</p>
      <p className="text-2xl leading-tight font-bold wrap-anywhere">
        {account}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
        <p className="min-w-0 wrap-anywhere">
          {bank} <span aria-hidden="true">|</span> {holder}
        </p>
        <button
          type="button"
          aria-label="계좌번호 복사"
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2.5"
          onClick={() => void copyAccount()}
        >
          <Image
            src="/images/reservations/menu-account-copy.svg"
            width={17}
            height={17}
            alt=""
          />
          복사
        </button>
      </div>
      <p role="status" className="text-xs empty:hidden">
        {copyMessage}
      </p>
    </div>
  );
}
