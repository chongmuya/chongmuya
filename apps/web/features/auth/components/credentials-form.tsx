"use client";

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
  appearance = "default",
  formError,
  returnTo = "/events",
}: {
  pending: boolean;
  appearance?: "default" | "auth";
  formError?: string;
  returnTo?: string;
  submit: (values: Credentials, onError: (error: Error) => void) => void;
}) {
  const id = useId();
  const branded = appearance === "auth";
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
      className={branded ? "mt-[36.7756px]" : "form-panel"}
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
        className={
          branded
            ? "gap-[7px] [&+div]:mt-[7px] [&_input]:mx-auto [&_input]:w-[calc(100%-8px)]"
            : undefined
        }
        labelClassName={branded ? "text-label text-white/80" : undefined}
        errorClassName={
          branded ? "m-0 px-4 font-semibold text-brand-ink" : undefined
        }
      >
        {(attributes) => (
          <Input
            {...attributes}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={branded ? "이메일을 입력해주세요" : undefined}
            variant={branded ? "pill" : "default"}
            {...register("email")}
            required
            maxLength={254}
            disabled={pending}
          />
        )}
      </FormField>
      <FormField
        id={`${id}-password`}
        label={branded ? "비밀번호" : "비밀번호 (8~16자)"}
        error={errors.password?.message}
        className={
          branded
            ? "gap-[7px] [&+div]:mt-[7px] [&_input]:mx-auto [&_input]:w-[calc(100%-8px)]"
            : undefined
        }
        labelClassName={branded ? "text-label text-white/80" : undefined}
        errorClassName={
          branded ? "m-0 px-4 font-semibold text-brand-ink" : undefined
        }
      >
        {(attributes) => (
          <Input
            {...attributes}
            type="password"
            autoComplete="current-password"
            placeholder={branded ? "비밀번호를 입력해주세요" : undefined}
            variant={branded ? "pill" : "default"}
            {...register("password")}
            required
            minLength={8}
            disabled={pending}
          />
        )}
      </FormField>
      <div className={branded ? "mt-[7px] min-h-[19px] px-4" : undefined}>
        <FormError
          message={errors.root?.server?.message ?? formError}
          className={
            branded
              ? "m-0 text-control font-semibold text-accent wrap-anywhere"
              : undefined
          }
        />
      </div>
      <Button
        type="submit"
        loading={pending}
        variant={branded ? "ink" : "solid"}
        className={branded ? "mt-[41px] w-full" : undefined}
      >
        {pending ? "처리 중…" : "로그인"}
      </Button>
      {branded && (
        <>
          <KakaoButton returnTo={returnTo} disabled={pending} />
          <div className="mt-[26px] text-center">
            <Link
              href="/auth/recovery"
              className="text-caption text-black/70 underline underline-offset-2"
            >
              비밀번호를 잊으셨나요?
            </Link>
          </div>
        </>
      )}
    </form>
  );
}
