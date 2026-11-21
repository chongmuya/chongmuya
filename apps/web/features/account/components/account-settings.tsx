"use client";
import { Button, buttonStyles } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { FormField } from "@/shared/ui/form-field";
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
  const owner = account.accountType === "owner";
  return (
    <div className="space-y-7 pt-3">
      <section className="space-y-3">
        <h2 className="text-label">프로필 수정</h2>
        <form
          className="space-y-4 rounded-card bg-surface p-5 shadow-card"
          onSubmit={profile.handleSubmit((v) => save.mutate(v))}
        >
          <p className="text-sm break-all text-secondary">
            {account.email} · {owner ? "사장님" : "총무"}
          </p>
          <FormField
            id="name"
            label="이름"
            error={profile.formState.errors.name?.message}
          >
            {(attrs) => (
              <Input
                {...attrs}
                autoComplete="name"
                {...profile.register("name")}
              />
            )}
          </FormField>
          {!owner && (
            <FormField
              id="nickname"
              label="총무 닉네임"
              hint="비워두면 기존 닉네임을 유지해요."
              error={profile.formState.errors.nickname?.message}
            >
              {(attrs) => (
                <Input
                  {...attrs}
                  autoComplete="nickname"
                  {...profile.register("nickname")}
                />
              )}
            </FormField>
          )}
          <FormError
            message={
              save.isError
                ? "프로필을 저장하지 못했어요. 다시 시도해 주세요."
                : undefined
            }
          />
          {save.isSuccess && (
            <p role="status" className="text-sm text-brand-ink">
              프로필을 저장했어요.
            </p>
          )}
          <Button type="submit" className="w-full" loading={save.isPending}>
            프로필 저장
          </Button>
        </form>
      </section>
      <section id="contact-verification" className="space-y-3 scroll-mt-6">
        <h2 className="text-label">연락처 인증 및 변경</h2>
        <div className="space-y-4 rounded-card bg-surface p-5 shadow-card">
          <div className="space-y-1 rounded-control bg-soft p-3 text-sm">
            <p className="text-secondary">현재 연락처</p>
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {account.phone ?? "등록된 번호 없음"}
              {account.phone && (
                <span className="text-xs font-medium text-secondary">
                  {account.phoneVerifiedAt ? "인증됨" : "미인증"}
                </span>
              )}
            </p>
          </div>
          <p className="text-sm break-keep text-secondary">
            새로 보내는 예약 문의와 서비스 연락에 이 번호를 사용해요.
          </p>
          {proof ? (
            <div className="space-y-3">
              <p className="text-sm break-keep">
                {proof.phone}에서 {proof.receiver}로 아래 문자를 보내 주세요.
              </p>
              <p className="rounded-control bg-soft p-3 text-sm break-all">
                {proof.message}
              </p>
              <p className="text-xs text-secondary">
                만료 시각{" "}
                {new Date(proof.expiresAt).toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  timeStyle: "short",
                })}
              </p>
              <a
                className={buttonStyles({
                  variant: "outline",
                  className: "w-full",
                })}
                href={`sms:${proof.receiver}?body=${encodeURIComponent(proof.message)}`}
              >
                문자 앱 열기
              </a>
              {waiting && (
                <p role="status" className="text-sm text-secondary">
                  아직 인증 문자를 확인하지 못했어요.
                </p>
              )}
              <FormError
                message={
                  verifyError
                    ? "인증 결과를 확인하지 못했어요. 만료되기 전에 다시 시도해 주세요."
                    : undefined
                }
              />
              <Button
                className="w-full"
                loading={checking}
                onClick={() => void verify()}
              >
                인증 확인 및 번호 변경
              </Button>
              <Button
                variant="outline"
                className="w-full border-transparent text-secondary"
                disabled={checking}
                onClick={() => setProof(undefined)}
              >
                입력으로 돌아가기
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(event) =>
                void phone.handleSubmit((v) => void issue(v))(event)
              }
              className="space-y-4"
            >
              <FormField
                id="new-phone"
                label="새 휴대폰 번호"
                error={phone.formState.errors.phone?.message}
              >
                {(attrs) => (
                  <Input
                    {...attrs}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="숫자만 입력해 주세요"
                    {...phone.register("phone")}
                  />
                )}
              </FormField>
              <FormError
                message={
                  issueError
                    ? "인증을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
                    : undefined
                }
              />
              <Button type="submit" className="w-full" loading={issuing}>
                인증 시작하기
              </Button>
            </form>
          )}
          {done && (
            <p role="status" className="text-sm text-brand-ink">
              인증된 연락처로 변경했어요.
            </p>
          )}
        </div>
      </section>
      {owner && (
        <section
          id="reservation-deposit-account"
          className="space-y-3 scroll-mt-6"
        >
          <h2 className="text-label">예약금 계좌</h2>
          <div className="rounded-card bg-surface p-5 shadow-card">
            <DepositAccountEntry
              key={account.id}
              accountId={account.id}
              request={request}
            />
          </div>
        </section>
      )}
    </div>
  );
}
