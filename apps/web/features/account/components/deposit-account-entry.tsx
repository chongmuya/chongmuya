"use client";

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ApiError } from "@/shared/http/api-error";
import { isAccessError } from "@/shared/http/access-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { FormError } from "@/shared/ui/form-error";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import {
  getDepositAccount,
  saveDepositAccount,
  type DepositAccount,
} from "../api/account.api";

const depositAccountSchema = z.object({
  bank: z.string().trim().min(1, "은행을 입력해 주세요.").max(80),
  account: z
    .string()
    .trim()
    .max(100)
    .refine(
      (v) => /^[\d -]+$/.test(v) && v.replace(/\D/g, "").length >= 4,
      "계좌번호를 확인해 주세요.",
    ),
  holder: z.string().trim().min(1, "예금주를 입력해 주세요.").max(80),
});

export function DepositAccountEntry({
  accountId,
  request,
}: {
  accountId: string;
  request: SessionRequest;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full"
        aria-haspopup="dialog"
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        예약금 계좌 등록·변경
      </Button>
      {saved && (
        <p role="status" className="text-xs text-muted">
          계정에 예약금 계좌를 저장했어요.
        </p>
      )}
      {open &&
        createPortal(
          <DepositAccountDialog
            accountId={accountId}
            request={request}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setSaved(true);
              setOpen(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

function DepositAccountDialog({
  accountId,
  request,
  onClose,
  onSaved,
}: {
  accountId: string;
  request: SessionRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const title = useId();
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["user", accountId, "owner-deposit-account"],
    queryFn: ({ signal }) => getDepositAccount(request, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const denied = isAccessError(query.error);
  return (
    <Dialog labelledBy={title} busy={saving} onClose={onClose} showCloseButton>
      <h2 id={title} className="mb-4 text-xl font-semibold">
        예약금 계좌
      </h2>
      {denied || (!query.data && query.isError) ? (
        <ErrorState retry={() => void query.refetch()}>
          예약금 계좌를 확인하지 못했어요.
        </ErrorState>
      ) : !query.data ? (
        <LoadingState>계좌 확인 중…</LoadingState>
      ) : (
        <DepositAccountForm
          current={query.data.depositAccount}
          request={request}
          saving={saving}
          onSaving={setSaving}
          onConflict={() => void query.refetch()}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function DepositAccountForm({
  current,
  request,
  saving,
  onSaving,
  onConflict,
  onSaved,
}: {
  current: DepositAccount | null;
  request: SessionRequest;
  saving: boolean;
  onSaving: (saving: boolean) => void;
  onConflict: () => void;
  onSaved: () => void;
}) {
  const [revision, setRevision] = useState(current?.revision ?? 0);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const active = useActiveScreen();
  const id = useId();
  const form = useForm({
    resolver: zodResolver(depositAccountSchema),
    defaultValues: {
      bank: current?.bank ?? "",
      account: current?.account ?? "",
      holder: current?.holder ?? "",
    },
  });
  const changed = revision !== (current?.revision ?? 0);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.stopPropagation();
        void form.handleSubmit(async (values) => {
          if (changed || submitting.current) return;
          submitting.current = true;
          onSaving(true);
          setError(undefined);
          try {
            await saveDepositAccount(request, {
              ...values,
              expectedRevision: revision,
            });
            if (active.current) onSaved();
          } catch (cause) {
            if (!active.current) return;
            if (cause instanceof ApiError && cause.status === 409) {
              setError(
                "계좌 정보가 변경됐어요. 최신 정보를 불러와 확인해 주세요.",
              );
              onConflict();
            } else {
              setError(
                "계좌를 저장하지 못했어요. 입력을 확인하고 다시 시도해 주세요.",
              );
            }
          } finally {
            submitting.current = false;
            if (active.current) onSaving(false);
          }
        })(event);
      }}
    >
      <p className="text-sm text-muted">
        계정에 한 번 등록하면 예약금 안내에서 이 계좌를 불러올 수 있어요.
      </p>
      {(
        [
          ["bank", "은행", 80],
          ["account", "계좌번호", 100],
          ["holder", "예금주", 80],
        ] as const
      ).map(([name, label, maxLength]) => (
        <FormField
          key={name}
          id={`${id}-${name}`}
          label={label}
          error={form.formState.errors[name]?.message}
        >
          {(attrs) => (
            <Input
              {...attrs}
              variant="form"
              maxLength={maxLength}
              inputMode={name === "account" ? "numeric" : "text"}
              autoComplete="off"
              disabled={saving}
              {...form.register(name)}
            />
          )}
        </FormField>
      ))}
      {changed && (
        <Button
          variant="outline"
          onClick={() => {
            setRevision(current?.revision ?? 0);
            form.reset({
              bank: current?.bank ?? "",
              account: current?.account ?? "",
              holder: current?.holder ?? "",
            });
            setError(undefined);
          }}
        >
          최신 계좌 확인하기
        </Button>
      )}
      <FormError message={error} />
      <Button
        type="submit"
        disabled={changed}
        loading={saving}
        className="w-full"
      >
        계좌 저장
      </Button>
    </form>
  );
}
