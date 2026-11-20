"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, buttonStyles } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PasswordInput } from "@/shared/ui/password-input";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { signupEmailSchema } from "../../schemas/signup.schema";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "../../schemas/password.schema";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";

const emailSchema = z.object({ email: signupEmailSchema });
type EmailValues = z.infer<typeof emailSchema>;
export type RecoveryLinkState = "checking" | "valid" | "expired" | "error";

// Form-local request lifetime; secrets stay out of Query and browser storage.
function useRecoveryRequest() {
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async (
    action: (signal: AbortSignal) => Promise<void>,
    onSuccess: () => void,
    onError: (error: unknown) => void,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    const current = new AbortController();
    controller.current = current;
    try {
      await action(current.signal);
      if (!current.signal.aborted) onSuccess();
    } catch (error) {
      if (!current.signal.aborted) onError(error);
    } finally {
      lock.current = false;
      if (!current.signal.aborted) setPending(false);
    }
  };
  return { pending, run };
}

export function RecoveryEmail({
  onBack,
  onRequest,
  loginHref = "/auth",
}: {
  onBack: () => void;
  loginHref?: string;
  onRequest: (email: string, signal: AbortSignal) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });
  const { pending, run } = useRecoveryRequest();
  const [sent, setSent] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [sent]);
  return (
    <StepLayout title="비밀번호 재설정" onBack={onBack} busy={pending}>
      <div ref={heading} className="px-[17px]">
        <StepHeading
          title={sent ? "이메일을 확인해 주세요." : "비밀번호를 잊으셨나요?"}
          description={
            sent
              ? "재설정 가능한 계정이면 안내 메일을 보내드려요. 메일함과 스팸함을 확인해 주세요."
              : "가입한 이메일을 입력해 주세요. 재설정 가능한 계정이면 안내 메일을 보내드려요."
          }
        />
      </div>
      {sent ? (
        <div role="status" className="px-[17px]">
          <p className="text-caption text-muted">
            메일이 오지 않았다면 이메일 주소를 확인하고 다시 요청해 주세요.
          </p>
          <Button
            variant="outline"
            className="mt-6 w-full"
            onClick={() => setSent(false)}
          >
            이메일 다시 입력
          </Button>
        </div>
      ) : (
        <form
          noValidate
          aria-label="재설정 메일 요청"
          onSubmit={handleSubmit((values) => {
            clearErrors();
            void run(
              (signal) => onRequest(values.email, signal),
              () => {
                reset();
                setSent(true);
              },
              (error) => applyFormError(error, setError, { email: "email" }),
            );
          })}
        >
          <div className="px-[17px]">
            <FormField
              required
              id="recovery-email"
              label="이메일"
              labelClassName="text-label"
              error={errors.email?.message}
            >
              {(attributes) => (
                <Input
                  {...attributes}
                  {...register("email")}
                  variant="pill"
                  className="shadow-control aria-invalid:bg-danger/10"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="chongmuya@gmail.com"
                  required
                  disabled={pending}
                />
              )}
            </FormField>
            <div className="mt-2 min-h-5">
              <FormError message={errors.root?.server?.message} />
            </div>
          </div>
          <Button type="submit" loading={pending} className="mt-5 w-full">
            {pending ? "요청 중…" : "링크 보내기"}
          </Button>
        </form>
      )}
      <div className="mt-auto pt-8">
        <Link
          href={loginHref}
          className={buttonStyles({ variant: "outline", className: "w-full" })}
        >
          로그인으로 돌아가기
        </Link>
      </div>
    </StepLayout>
  );
}

type RecoveryPasswordProps = {
  linkState: RecoveryLinkState;
  onBack: () => void;
  onRetry: () => void;
  loginHref?: string;
  onSubmit: (values: ResetPasswordValues, signal: AbortSignal) => Promise<void>;
};

export function RecoveryPassword(props: RecoveryPasswordProps) {
  // Changing link validity discards drafts and aborts any previous request.
  return <RecoveryPasswordForm key={props.linkState} {...props} />;
}

function RecoveryPasswordForm({
  linkState,
  onBack,
  onRetry,
  onSubmit,
  loginHref = "/auth",
}: RecoveryPasswordProps) {
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });
  const { pending, run } = useRecoveryRequest();
  const [complete, setComplete] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [complete, linkState]);
  return (
    <StepLayout title="비밀번호 재설정" onBack={onBack} busy={pending}>
      <div ref={heading} className="px-[17px]">
        <StepHeading
          title={
            complete
              ? "비밀번호를 변경했어요."
              : linkState === "checking"
                ? "재설정 링크를 확인하고 있어요."
                : linkState === "expired"
                  ? "링크가 만료되었어요."
                  : linkState === "error"
                    ? "링크를 확인할 수 없어요."
                    : "새 비밀번호를 입력해 주세요."
          }
          description={
            complete
              ? "새 비밀번호로 다시 로그인해 주세요."
              : linkState === "expired" || linkState === "error"
                ? "재설정 메일을 다시 요청해 주세요."
                : undefined
          }
        />
      </div>
      {complete ? (
        <Link
          href={loginHref}
          className={buttonStyles({ variant: "outline", className: "mt-auto" })}
        >
          로그인으로 돌아가기
        </Link>
      ) : linkState === "checking" ? (
        <p role="status" className="px-[17px]">
          확인 중…
        </p>
      ) : linkState !== "valid" ? (
        <Button onClick={onRetry} className="mt-auto">
          {linkState === "error" ? "링크 다시 확인" : "재설정 메일 다시 요청"}
        </Button>
      ) : (
        <form
          noValidate
          aria-label="새 비밀번호 설정"
          className="flex flex-1 flex-col"
          onSubmit={handleSubmit((values) => {
            clearErrors();
            void run(
              (signal) => onSubmit(values, signal),
              () => {
                reset();
                setComplete(true);
              },
              (error) =>
                applyFormError(error, setError, {
                  password: "password",
                  passwordConfirm: "passwordConfirm",
                }),
            );
          })}
        >
          <div className="space-y-9 px-[17px]">
            <FormField
              required
              id="reset-password"
              label="비밀번호"
              labelClassName="text-label"
              hint="8~16자, 공백 없이 영문·숫자·일반 특수문자 허용"
              error={errors.password?.message}
            >
              {(attributes) => (
                <PasswordInput
                  {...attributes}
                  {...register("password")}
                  variant="pill"
                  className="shadow-control aria-invalid:bg-danger/10"
                  autoComplete="new-password"
                  placeholder="비밀번호를 입력해 주세요"
                  required
                  disabled={pending}
                />
              )}
            </FormField>
            <FormField
              required
              id="reset-passwordConfirm"
              label="비밀번호 확인"
              labelClassName="text-label"
              error={errors.passwordConfirm?.message}
            >
              {(attributes) => (
                <PasswordInput
                  {...attributes}
                  {...register("passwordConfirm")}
                  variant="pill"
                  className="shadow-control aria-invalid:bg-danger/10"
                  autoComplete="new-password"
                  placeholder="비밀번호를 다시 입력해 주세요"
                  required
                  disabled={pending}
                />
              )}
            </FormField>
          </div>
          <div className="mt-auto pt-12">
            <div className="mb-3 min-h-5">
              <FormError message={errors.root?.server?.message} />
            </div>
            <Button type="submit" loading={pending} className="w-full">
              {pending ? "변경 중…" : "비밀번호 변경하기"}
            </Button>
          </div>
        </form>
      )}
    </StepLayout>
  );
}
