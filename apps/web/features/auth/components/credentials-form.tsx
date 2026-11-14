"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormError } from "@/shared/ui/form-error";
import {
  credentialsSchema,
  type Credentials,
} from "../schemas/credentials.schema";

export function CredentialsForm({
  mode,
  pending,
  submit,
}: {
  mode: "login" | "signup";
  pending: boolean;
  submit: (values: Credentials) => void;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });
  return (
    <form
      noValidate
      className="form-panel"
      onSubmit={handleSubmit((values) => {
        if (!pending) submit(values);
      })}
    >
      <div>
        <label htmlFor={`${id}-email`}>이메일</label>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          {...register("email")}
          required
          maxLength={254}
          disabled={pending}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${id}-email-error` : undefined}
        />
        <FormError id={`${id}-email-error`} message={errors.email?.message} />
      </div>
      <div>
        <label htmlFor={`${id}-password`}>비밀번호 (12~128자)</label>
        <Input
          id={`${id}-password`}
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          {...register("password")}
          required
          minLength={12}
          maxLength={128}
          disabled={pending}
          aria-invalid={!!errors.password}
          aria-describedby={
            errors.password ? `${id}-password-error` : undefined
          }
        />
        <FormError
          id={`${id}-password-error`}
          message={errors.password?.message}
        />
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "처리 중…" : mode === "signup" ? "가입하기" : "로그인"}
      </Button>
    </form>
  );
}
