"use client";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { nicknameSchema } from "../schemas/first-setup.schema";
import { useFirstSetup } from "../hooks/use-first-setup";
export function FirstSetupForm({ onExit }: { onExit: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current?.querySelector<HTMLElement>("h1")?.focus();
  }, []);
  return (
    <div ref={container}>
      <StepLayout title="" onBack={onExit}>
        <NicknameForm />
      </StepLayout>
    </div>
  );
}
function NicknameForm() {
  const form = useForm({
    resolver: zodResolver(nicknameSchema),
    defaultValues: { nickname: "" },
  });
  const save = useFirstSetup();
  return (
    <form
      className="flex flex-1 flex-col"
      noValidate
      onSubmit={form.handleSubmit(async (value) => {
        await save
          .mutateAsync({ accountType: "organizer", ...value })
          .catch(() => undefined);
      })}
    >
      <div className="px-[17px]">
        <StepHeading
          title="어떻게 불러드릴까요?"
          description="총무야에서 사용할 닉네임을 설정해 주세요."
          className="mb-6"
        />
        <FormField
          id="setup-nickname"
          label="닉네임"
          labelClassName="sr-only"
          required
          error={form.formState.errors.nickname?.message}
        >
          {(attributes) => (
            <Input
              {...attributes}
              {...form.register("nickname")}
              variant="pill"
              className="shadow-control"
              autoComplete="nickname"
              placeholder="닉네임을 입력해 주세요"
              disabled={save.isPending}
            />
          )}
        </FormField>
      </div>
      <div className="mt-auto pt-12">
        <FormError
          message={save.error ? safeErrorMessage(save.error) : undefined}
        />
        <Button
          type="submit"
          variant="brand-outline"
          loading={save.isPending}
          className="mt-3 w-full"
        >
          다음
        </Button>
      </div>
    </form>
  );
}
