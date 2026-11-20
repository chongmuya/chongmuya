"use client";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { RosterEditor } from "@/features/roster/client";
import type { RosterRow } from "@/features/roster/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ApiError } from "@/shared/http/api-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";
import {
  groupRegistrationSchema,
  type GroupRegistrationValues,
} from "../schemas/group-registration.schema";
import { useRegisterGroup } from "../hooks/use-register-group";
import { GROUP_TYPES } from "../types/group-type";
import type {
  Group,
  GroupMember,
  AddedGroupMembers,
} from "../types/group.types";
export function GroupRegistration({
  accountId,
  request,
  onNavigate,
  target,
}: {
  target?: { group: Group; members: GroupMember[] };
  accountId: string;
  request: SessionRequest;
  onNavigate: (path: string) => void;
}) {
  const id = useId(),
    active = useActiveScreen();
  const [step, setStep] = useState<"group" | "roster">(
    target ? "roster" : "group",
  );
  const [started, setStarted] = useState(!!target);
  const [completed, setCompleted] = useState<AddedGroupMembers | null>(null),
    [leaving, setLeaving] = useState(false),
    [error, setError] = useState<string>();
  const requestKey = useRef<string | null>(null),
    previousSkip = useRef(false),
    submitting = useRef(false);
  const form = useForm<GroupRegistrationValues>({
    resolver: zodResolver(groupRegistrationSchema),
    defaultValues: {
      name: target?.group.name ?? "",
      groupType: target?.group.groupType ?? "",
    },
  });
  const save = useRegisterGroup(accountId, request, setCompleted);
  const persist = async (
    rows: RosterRow[],
    duplicatesConfirmed: boolean,
    skip = false,
  ) => {
    if (submitting.current) return;
    if (skip && requestKey.current && !previousSkip.current) {
      setError(
        "진행한 등록 결과가 불확실해요. 같은 명단으로 다시 저장하거나 홈에서 확인해 주세요.",
      );
      return;
    }
    submitting.current = true;
    previousSkip.current = skip;
    requestKey.current ??= crypto.randomUUID();
    setError(undefined);
    const metadata = form.getValues();
    const members = rows.map(({ name, phoneLast4, label, match }) => ({
      name,
      phoneLast4: phoneLast4 || null,
      label: label || null,
      ...(match && match !== "new" ? { existingMemberId: match } : {}),
    }));
    try {
      await save.mutateAsync(
        target
          ? {
              kind: "append",
              groupId: target.group.id,
              input: {
                requestKey: requestKey.current,
                members,
                duplicatesConfirmed,
              },
            }
          : {
              kind: "create",
              input: {
                name: metadata.name.trim(),
                groupType: metadata.groupType.trim() || null,
                creationKey: requestKey.current,
                members,
                duplicatesConfirmed,
              },
            },
      );
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.code === "ROSTER_MEMBER_CONFLICT")
      )
        requestKey.current = null;
      throw cause;
    } finally {
      submitting.current = false;
    }
  };
  if (completed)
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[402px] flex-col justify-center gap-6 px-6 py-12 text-center">
        <Image
          className="mx-auto"
          src="/images/ui/success.svg"
          alt=""
          width={48}
          height={48}
        />
        <div>
          <h1 className="text-2xl font-bold">
            {target ? "명단을 확인했어요!" : "모임이 만들어졌어요!"}
          </h1>
          <p className="mt-2 break-words text-caption text-muted">
            {completed.group.name}
            {target
              ? ` · ${completed.addedCount}명 추가 완료 (총 ${completed.group.memberCount}명)`
              : completed.group.memberCount > 0
                ? ` · 명단 ${completed.group.memberCount}명 등록 완료`
                : " · 명단 없이 등록 완료"}
          </p>
        </div>
        <div className="space-y-2">
          {target && (
            <Button
              className="w-full"
              onClick={() =>
                onNavigate(`/mypage?view=roster&group=${target.group.id}`)
              }
            >
              명단으로 돌아가기
            </Button>
          )}
          <Button
            className="w-full"
            onClick={() => onNavigate(`/events?group=${completed.group.id}`)}
          >
            행사 등록하기
          </Button>
          <Button
            className="w-full"
            variant="brand-outline"
            onClick={() => onNavigate(`/?group=${completed.group.id}`)}
          >
            홈으로 가기
          </Button>
        </div>
      </main>
    );
  return (
    <>
      {step === "group" && (
        <StepLayout title="모임 등록" onBack={() => setLeaving(true)}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() => {
              setStarted(true);
              setStep("roster");
            })}
            className="flex flex-1 flex-col"
          >
            <StepHeading title="어떤 모임을 관리하시나요?" />
            <div className="space-y-12">
              <FormField
                id={`${id}-name`}
                label="모임 이름"
                required
                error={form.formState.errors.name?.message}
              >
                {(attributes) => (
                  <Input
                    {...attributes}
                    {...form.register("name")}
                    variant="pill"
                    placeholder="예) 사진 소모임"
                    autoComplete="off"
                  />
                )}
              </FormField>
              <FormField
                id={`${id}-type`}
                label="모임 유형 (선택)"
                error={form.formState.errors.groupType?.message}
              >
                {(attributes) => (
                  <select
                    {...attributes}
                    {...form.register("groupType")}
                    className="min-h-12 w-full rounded-pill border border-field bg-surface px-4"
                  >
                    <option value="">모임 유형 선택</option>
                    {GROUP_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>
            <Button className="mt-auto w-full" type="submit">
              다음
            </Button>
          </form>
        </StepLayout>
      )}
      {started && (
        <div hidden={step !== "roster"}>
          <RosterEditor
            existing={target?.members}
            title={target ? "명단 추가" : "모임 등록"}
            busy={save.isPending}
            onBack={() => {
              if (target) setLeaving(true);
              else setStep("group");
            }}
            onSave={(rows, confirmed) => persist(rows, confirmed)}
            skip={
              target
                ? undefined
                : () => {
                    void persist([], false, true).catch((cause) => {
                      if (active.current) setError(safeErrorMessage(cause));
                    });
                  }
            }
          />
          <FormError message={error} />
        </div>
      )}
      {leaving && (
        <Dialog labelledBy={`${id}-leave`} onClose={() => setLeaving(false)}>
          <h2 id={`${id}-leave`} className="text-label">
            명단 작성을 나가시겠어요?
          </h2>
          <p className="my-4 text-caption">
            아직 저장하지 않은 입력은 사라져요.
          </p>
          <Button className="w-full" onClick={() => setLeaving(false)}>
            계속 작성하기
          </Button>
          <Button
            className="mt-2 w-full"
            variant="outline"
            onClick={() =>
              onNavigate(
                target ? `/mypage?view=roster&group=${target.group.id}` : "/",
              )
            }
          >
            나가기
          </Button>
        </Dialog>
      )}
    </>
  );
}
