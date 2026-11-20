"use client";
import { useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, buttonStyles } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import Link from "next/link";
import { NoticeDialog } from "@/shared/ui/notice-dialog";
import type { SignupValues } from "../../schemas/signup.schema";
import type { useContactVerification } from "../../hooks/use-contact-verification";
import { VerificationRequestButton } from "../verification-request-button";
const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "6자리 숫자 인증번호를 입력해 주세요."),
});
export function EmailVerification({
  email,
  trusted = false,
  loginHref = "/auth",
}: {
  email: ReturnType<typeof useContactVerification>;
  trusted?: boolean;
  loginHref?: string;
}) {
  const {
    register,
    trigger,
    formState: { errors },
  } = useFormContext<SignupValues>();
  const { state, now, error } = email;
  const waiting = Math.max(0, Math.ceil(((state.retryAt ?? 0) - now) / 1000));
  const busy = state.status === "requesting";
  const verified = trusted || state.status === "verified";
  const requestLabel = verified
    ? "인증 완료"
    : waiting
      ? `${waiting}초 후 재전송`
      : state.id
        ? "재전송"
        : "인증하기";
  const statusMessage = trusted
    ? "카카오에서 확인한 이메일이에요. 변경하면 다시 인증해 주세요."
    : busy
      ? "이메일 인증을 처리하고 있어요."
      : state.status === "verified"
        ? "이메일 인증이 완료되었어요."
        : state.status === "expired"
          ? "인증 시간이 만료되었어요. 다시 요청해 주세요."
          : state.status === "error"
            ? !error && "이메일 발송에 실패했어요. 대기 후 다시 요청해 주세요."
            : state.id && "메일로 받은 인증번호를 입력해 주세요.";
  return (
    <div className="space-y-3">
      <FormField
        required
        id="signup-email"
        label="이메일"
        className="gap-2"
        labelClassName="text-label text-black/80"
        error={errors.email?.message}
      >
        {(attributes) => (
          <div className="flex items-start gap-2">
            <Input
              {...attributes}
              {...register("email", { onChange: email.reset })}
              variant="pill"
              className="min-w-0 shadow-control aria-invalid:bg-danger/10 max-[374px]:px-3 max-[374px]:placeholder:text-sm"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="chongmuya@gmail.com"
              required
            />
            <VerificationRequestButton
              aria-label={`이메일 ${requestLabel}`}
              disabled={verified || busy || waiting > 0}
              onClick={() =>
                void trigger("email", { shouldFocus: true }).then((valid) => {
                  if (valid) void email.request();
                })
              }
            >
              {requestLabel}
            </VerificationRequestButton>
          </div>
        )}
      </FormField>
      {statusMessage && (
        <p role="status" className="text-caption text-muted">
          {statusMessage}
        </p>
      )}
      <FormError message={error} />
      {email.errorCode === "EMAIL_ALREADY_REGISTERED" && (
        <NoticeDialog
          title="이미 가입된 이메일이에요."
          description="다른 이메일을 사용하거나 가입할 때 사용한 방법으로 로그인해 주세요."
          onClose={email.dismissError}
        >
          <Button variant="brand-outline" onClick={email.dismissError}>
            닫기
          </Button>
          <Link href={loginHref} className={buttonStyles()}>
            로그인 하기
          </Link>
        </NoticeDialog>
      )}
      {!trusted &&
        state.id &&
        !state.deliveryFailed &&
        state.status !== "verified" &&
        state.status !== "expired" && (
          <EmailCode key={state.id} email={email} />
        )}
      {!verified && state.expiresAt && state.status !== "expired" && (
        <p className="text-caption text-muted">
          남은 인증 시간{" "}
          {Math.max(0, Math.ceil((state.expiresAt - now) / 1000))}초
        </p>
      )}
    </div>
  );
}
function EmailCode({
  email,
}: {
  email: ReturnType<typeof useContactVerification>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const check = handleSubmit(async ({ code }) => {
    await email.check?.(code);
    reset({ code: "" });
  });
  const busy = email.state.status === "requesting";
  return (
    <FormField
      id="signup-email-code"
      label="이메일 인증번호"
      error={errors.code?.message}
    >
      {(attributes) => (
        <div className="flex items-start gap-2">
          <Input
            {...attributes}
            {...register("code")}
            variant="pill"
            className="min-w-0 shadow-control"
            disabled={busy}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6자리 인증번호"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void check();
              }
            }}
          />
          <Button
            className="h-input shrink-0 rounded-control text-caption whitespace-nowrap"
            disabled={busy || email.state.attemptsRemaining === 0}
            onClick={() => void check()}
          >
            인증번호 확인
          </Button>
        </div>
      )}
    </FormField>
  );
}
