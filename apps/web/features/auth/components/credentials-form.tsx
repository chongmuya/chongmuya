"use client";

import { authEntryPath } from "../lib/auth-entry-path";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { ApiError } from "@/shared/http/api-error";
import { useId } from "react";
import { KakaoButton } from "./kakao-button";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormError } from "@/shared/ui/form-error";
import { FormField } from "@/shared/ui/form-field";
import {
  credentialsSchema,
  type Credentials,
} from "../schemas/credentials.schema";

export function CredentialsForm({
  pending,
  submit,
  formError,
  returnTo,
}: {
  pending: boolean;
  formError?: string;
  returnTo: string;
  submit: (values: Credentials, onError: (error: Error) => void) => void;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });
  return (
    <form
      noValidate
      aria-label="로그인"
      className="mt-[36.7756px]"
      onSubmit={handleSubmit((values) => {
        if (pending) return;
        clearErrors();
        submit(values, (error) => {
          if (error instanceof ApiError && error.code === "VALIDATION_FAILED")
            applyFormError(error, setError, {
              email: "email",
              password: "password",
            });
        });
      })}
    >
      <FormField
        id={`${id}-email`}
        label="이메일"
        error={errors.email?.message}
        className="gap-[7px] [&+div]:mt-[7px] [&_input]:mx-auto [&_input]:w-[calc(100%-8px)]"
        labelClassName="text-label text-white/80"
        errorClassName="m-0 px-4 font-semibold text-brand-ink"
      >
        {(attributes) => (
          <Input
            {...attributes}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="이메일을 입력해주세요"
            variant="pill"
            {...register("email")}
            required
            maxLength={254}
            disabled={pending}
          />
        )}
      </FormField>
      <FormField
        id={`${id}-password`}
        label="비밀번호"
        error={errors.password?.message}
        className="gap-[7px] [&+div]:mt-[7px] [&_input]:mx-auto [&_input]:w-[calc(100%-8px)]"
        labelClassName="text-label text-white/80"
        errorClassName="m-0 px-4 font-semibold text-brand-ink"
      >
        {(attributes) => (
          <Input
            {...attributes}
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호를 입력해주세요"
            variant="pill"
            {...register("password")}
            required
            minLength={8}
            disabled={pending}
          />
        )}
      </FormField>
      <div className="mt-[7px] min-h-[19px] px-4">
        <FormError
          message={errors.root?.server?.message ?? formError}
          className="m-0 text-control font-semibold text-accent wrap-anywhere"
        />
      </div>
      <Button
        type="submit"
        loading={pending}
        variant="ink"
        className="mt-[41px] w-full"
      >
        {pending ? "처리 중…" : "로그인"}
      </Button>
      <KakaoButton returnTo={returnTo} disabled={pending} />
      <div className="mt-[26px] text-center">
        <Link
          href={authEntryPath("/auth/recovery", returnTo)}
          className="text-caption text-black/70 underline underline-offset-2"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </div>
    </form>
  );
}
