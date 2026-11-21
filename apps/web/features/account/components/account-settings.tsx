"use client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useAccountSettings } from "../hooks/use-account-settings";
import { DepositAccountEntry } from "./deposit-account-entry";
export function AccountSettings() {
  const {
    account,
    request,
    profile,
    save,
    phone,
    issue,
    issuing,
    checking,
    issueError,
    proof,
    verify,
    setProof,
    waiting,
    verifyError,
    done,
  } = useAccountSettings();
  if (!account) return null;
  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={profile.handleSubmit((v) => save.mutate(v))}
      >
        <h2 className="text-xl font-bold">프로필 수정</h2>
        <p>
          {account.email} ·{" "}
          {account.accountType === "owner" ? "사장님" : "총무"}
        </p>
        {(
          [
            "name",
            ...(account.accountType === "organizer"
              ? (["nickname"] as const)
              : []),
          ] as const
        ).map((field) => (
          <div key={field}>
            <label htmlFor={field}>
              {field === "name" ? "이름" : "총무 닉네임"}
            </label>
            <Input
              id={field}
              {...profile.register(field)}
              aria-invalid={!!profile.formState.errors[field]}
              aria-describedby={`${field}-error`}
            />
            {field === "nickname" && (
              <p className="text-xs text-muted">
                비워두면 기존 닉네임을 유지해요.
              </p>
            )}
            <p id={`${field}-error`} role="alert">
              {profile.formState.errors[field]?.message}
            </p>
          </div>
        ))}
        {save.isError && (
          <p role="alert">
            프로필을 저장하지 못했어요. 입력을 확인하고 다시 시도해 주세요.
          </p>
        )}
        {save.isSuccess && <p role="status">프로필을 저장했어요.</p>}
        <Button type="submit" disabled={save.isPending}>
          프로필 저장
        </Button>
      </form>
      {account.accountType === "owner" && (
        <section
          id="reservation-deposit-account"
          className="space-y-3 scroll-mt-6"
        >
          <h2 className="text-xl font-bold">예약금 계좌</h2>
          <DepositAccountEntry
            key={account.id}
            accountId={account.id}
            request={request}
          />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">연락처 인증 및 변경</h2>
        <p>
          현재 연락처: {account.phone ?? "등록된 번호 없음"}{" "}
          {account.phoneVerifiedAt ? "(인증됨)" : "(미인증)"}
        </p>
        <p className="text-xs text-muted">
          앞으로 생성하는 문의·운영 연락에 사용돼요. 기존 문의·예약의 당시
          연락처와 매장 담당자 연락처는 별도로 유지돼요.
        </p>
        <form
          onSubmit={(event) =>
            void phone.handleSubmit((v) => void issue(v))(event)
          }
          className="space-y-3"
        >
          <label htmlFor="new-phone">새 휴대폰 번호</label>
          <Input
            id="new-phone"
            type="tel"
            {...phone.register("phone")}
            aria-invalid={!!phone.formState.errors.phone}
            aria-describedby="phone-error"
          />
          <p id="phone-error" role="alert">
            {phone.formState.errors.phone?.message}
          </p>
          <Button type="submit" disabled={issuing || checking}>
            변경용 인증 시작
          </Button>
        </form>
        {issueError && (
          <p role="alert">
            인증을 시작하지 못했어요. 설정 또는 재요청 가능 시간을 확인한 뒤
            다시 시도해 주세요.
          </p>
        )}
        {proof && (
          <div className="space-y-3 rounded-control bg-surface p-4">
            <p>
              {proof.phone}에서 {proof.receiver}로 아래 문자를 직접 보내 주세요.
            </p>
            <p className="break-all">{proof.message}</p>
            <a
              className="underline"
              href={`sms:${proof.receiver}?body=${encodeURIComponent(proof.message)}`}
            >
              문자 앱 열기
            </a>
            <p className="text-xs">
              만료: {new Date(proof.expiresAt).toLocaleTimeString("ko-KR")} ·
              발송 후 잠시 기다려 주세요.
            </p>
            <Button
              disabled={checking || issuing}
              onClick={() => void verify()}
            >
              인증 확인 및 번호 변경
            </Button>
            <Button variant="outline" onClick={() => setProof(undefined)}>
              입력으로 돌아가기
            </Button>
            {waiting && <p>아직 인증 문자를 확인하지 못했어요.</p>}
          </div>
        )}
        {verifyError && (
          <p role="alert">
            인증 결과를 확인하지 못했어요. 증명이 만료되지 않았다면 같은
            인증으로 다시 확인해 주세요.
          </p>
        )}
        {done && <p role="status">인증된 연락처로 변경했어요.</p>}
      </section>
    </div>
  );
}
