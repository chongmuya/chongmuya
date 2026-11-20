"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useGroupMembers } from "@/features/groups/client";
import { reviewRoster } from "@/features/roster/client";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Checkbox } from "@/shared/ui/checkbox";
import { StepLayout } from "@/shared/ui/step-layout";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { FormError } from "@/shared/ui/form-error";
import { Dialog } from "@/shared/ui/dialog";
import { ApiError } from "@/shared/http/api-error";
import { isAccessError } from "@/shared/http/access-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import type { ParticipantDto } from "../types/attendance.types";
import type { AttendanceAction } from "../api/attendance.api";
import type { OwnerProps } from "./event-roster";
import { useAttendanceAction } from "../hooks/use-attendance-action";
import {
  importDirectSchema,
  importGroupSchema,
  type ImportDirectInput,
  type ImportGroupInput,
} from "../schemas/import-group.schema";
import { ImportDirectMembers } from "./import-direct-members";

const rosterVersions = (people: { id: string; version: number }[]) =>
  JSON.stringify(
    people
      .map(({ id, version }) => ({ id, version }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );

export function ImportGroupRoster({
  accountId,
  eventId,
  request,
  groupId,
  existing,
  onClose,
  onImported,
}: OwnerProps & {
  groupId: string;
  existing: ParticipantDto[];
  onClose: () => void;
  onImported: (addedCount: number) => void;
}) {
  const members = useGroupMembers(accountId, groupId, request);
  const action = useAttendanceAction(accountId, eventId, request);
  const active = useActiveScreen();
  const [search, setSearch] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [reviewedRoster, setReviewedRoster] = useState(existing);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const pending = useRef<Extract<
    AttendanceAction,
    { kind: "import-selected" }
  > | null>(null);
  const form = useForm<ImportGroupInput>({
    resolver: zodResolver(importGroupSchema),
    defaultValues: { members: [], directMembers: [] },
  });
  const draft = useForm<ImportDirectInput>({
    resolver: zodResolver(importDirectSchema),
    defaultValues: { name: "", phoneLast4: "", label: "" },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "directMembers",
  });
  const selected = useWatch({ control: form.control, name: "members" });
  const direct = useWatch({ control: form.control, name: "directMembers" });
  const directDraft = useWatch({ control: draft.control });
  const imported = new Set(existing.map((person) => person.groupMemberId));
  const ids = new Set(selected.map((member) => member.id));
  const term = search.trim().toLocaleLowerCase("ko-KR");
  const shown = (members.data ?? []).filter(
    (member) =>
      member.name.toLocaleLowerCase("ko-KR").includes(term) ||
      (member.phoneLast4 ?? "").includes(term),
  );
  const available = shown.filter((member) => !imported.has(member.id));
  const selectedPeople = (members.data ?? []).filter(
    (member) => ids.has(member.id) && !imported.has(member.id),
  );
  // Source IDs participate only in namesake review, never as an existing event-participant ID.
  const reviewPeople = [
    ...reviewedRoster,
    ...selectedPeople.map((person) => ({
      ...person,
      id: `group:${person.id}`,
    })),
  ];
  const review = reviewRoster(direct, reviewPeople);
  const fingerprint = JSON.stringify([direct, reviewPeople]);
  const confirmed = confirmation === fingerprint;
  const rosterChanged =
    direct.length > 0 &&
    rosterVersions(existing) !== rosterVersions(reviewedRoster);
  const draftDirty = Object.values(directDraft).some(
    (value) => !!value?.trim(),
  );
  const dirty = selected.length > 0 || direct.length > 0 || draftDirty;
  useEffect(() => {
    if (!dirty && !uncertain && !action.isPending) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, uncertain, action.isPending]);
  const stale =
    !!members.data &&
    selected.some(
      (selection) =>
        !members.data.some(
          (member) =>
            member.id === selection.id && member.version === selection.version,
        ),
    );
  const allSelected =
    available.length > 0 && available.every((member) => ids.has(member.id));
  const update = (value: ImportGroupInput["members"]) => {
    form.setValue("members", value, {
      shouldDirty: true,
      shouldValidate: true,
    });
    action.reset();
  };
  const save = () => {
    if (!pending.current) return;
    action.mutate(pending.current, {
      onSuccess: (result) => {
        if (!active.current || !("addedCount" in result)) return;
        pending.current = null;
        onImported(result.addedCount);
      },
      onError: (error) => {
        if (!active.current) return;
        const unknown =
          !(error instanceof ApiError) ||
          error.status < 400 ||
          error.status >= 500;
        setUncertain(unknown);
        if (!unknown) pending.current = null;
      },
    });
  };
  const close = () => {
    if (action.isPending || uncertain) return;
    if (dirty) setLeaving(true);
    else onClose();
  };
  if (isAccessError(members.error) || isAccessError(action.error))
    return (
      <StepLayout title="" onBack={onClose}>
        <ErrorState retry={() => void members.refetch()}>
          이 명단을 가져올 권한이 없어요.
        </ErrorState>
      </StepLayout>
    );
  if (!members.data)
    return (
      <StepLayout title="" onBack={onClose}>
        {members.isError ? (
          <ErrorState retry={() => void members.refetch()} />
        ) : (
          <LoadingState>모임 명단 확인 중…</LoadingState>
        )}
      </StepLayout>
    );
  return (
    <StepLayout title="" onBack={close} busy={action.isPending || uncertain}>
      <form
        noValidate
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          void form.handleSubmit((values) => {
            if (draftDirty) {
              draft.setError("root", {
                message: "작성 중인 이름·번호를 먼저 직접 추가해 주세요.",
              });
              return;
            }
            draft.clearErrors("root");
            form.clearErrors();
            if (stale || rosterChanged) return;
            const result = reviewRoster(values.directMembers, reviewPeople);
            for (const issue of result.issues)
              form.setError(`directMembers.${issue.index}.${issue.field}`, {
                message: issue.message,
              });
            if (result.issues.length) return;
            if (result.duplicates.length && !confirmed) {
              form.setError("root", { message: "동명이인을 확인해 주세요." });
              return;
            }
            if (
              existing.length + selectedPeople.length + result.addedCount >
              500
            ) {
              form.setError("root", {
                message: "명단은 500명까지 등록할 수 있어요.",
              });
              return;
            }
            pending.current ??= {
              kind: "import-selected",
              requestKey: crypto.randomUUID(),
              members: values.members.map(({ id, version }) => ({
                id,
                version,
              })),
              ...(values.directMembers.length
                ? {
                    directMembers: values.directMembers.map((person) => ({
                      name: person.name,
                      phoneLast4: person.phoneLast4 || null,
                      label: person.label || null,
                      existingParticipantId:
                        person.match && person.match !== "new"
                          ? person.match
                          : undefined,
                      newPersonConfirmed: person.match === "new",
                    })),
                    expectedRoster: reviewedRoster.map(({ id, version }) => ({
                      id,
                      version,
                    })),
                    duplicatesConfirmed: confirmed,
                  }
                : {}),
            };
            save();
          })(event);
        }}
      >
        <div className="mx-auto w-full max-w-[334px] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl leading-[normal] font-semibold">
              모임 명단에서 추가
            </h1>
            <button
              type="button"
              className="min-h-6 cursor-pointer text-sm font-semibold text-brand disabled:text-secondary"
              disabled={action.isPending || uncertain || !available.length}
              onClick={() => {
                const current = form.getValues("members");
                const visibleIds = new Set(
                  available.map((member) => member.id),
                );
                update(
                  allSelected
                    ? current.filter((member) => !visibleIds.has(member.id))
                    : [
                        ...current,
                        ...available
                          .filter((member) => !ids.has(member.id))
                          .map(({ id, version }) => ({ id, version })),
                      ],
                );
              }}
            >
              {allSelected ? "전체 선택 해제" : "전체 선택"}
            </button>
          </div>
          {members.isError && (
            <ErrorState retry={() => void members.refetch()}>
              최신 명단을 불러오지 못했어요. 선택은 유지돼요.
            </ErrorState>
          )}
          <div className="relative">
            <Image
              src="/images/groups/search.svg"
              alt=""
              width={20}
              height={20}
              className="pointer-events-none absolute top-3 left-3"
            />
            <Input
              name="importSearch"
              type="search"
              aria-label="가져올 이름 · 전화번호 뒤 4자리 검색"
              placeholder="이름 · 전화번호 뒤 4자리 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={action.isPending || uncertain}
              className="min-h-11 rounded-panel border-0 pl-10 text-xs shadow-control placeholder:text-placeholder"
            />
          </div>
          <p role="status" className="sr-only">
            전체 {members.data.length}명 · 검색 결과 {shown.length}명 · 선택{" "}
            {selected.length}명
          </p>
          <fieldset
            disabled={action.isPending || uncertain}
            className="rounded-card bg-surface p-4 shadow-card"
          >
            <legend className="sr-only">가져올 구성원</legend>
            {!members.data.length ? (
              <p className="p-5 text-center text-sm text-secondary">
                모임 기본 명단이 비어 있어요.
              </p>
            ) : !shown.length ? (
              <p className="p-5 text-center text-sm text-secondary">
                검색 결과가 없어요.
              </p>
            ) : (
              <ul>
                {shown.map((member) => (
                  <li key={member.id}>
                    <label className="flex min-h-[67px] cursor-pointer items-center justify-between gap-4 px-5 py-4">
                      <span className="min-w-0 text-center">
                        <span className="block text-sm leading-[normal] font-semibold break-words">
                          {member.name}
                        </span>
                        <span className="mt-1 block text-xs leading-[normal] text-secondary">
                          {[member.phoneLast4 ?? "번호 미등록", member.label]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {imported.has(member.id) && (
                          <span className="mt-1 block text-xs text-secondary">
                            이미 가져온 구성원
                          </span>
                        )}
                      </span>
                      <Checkbox
                        aria-label={`${member.name} ${member.phoneLast4 ?? "번호 미등록"}${member.label ? ` ${member.label}` : ""} 선택`}
                        className="size-7"
                        checked={ids.has(member.id)}
                        disabled={imported.has(member.id)}
                        onChange={(event) => {
                          const current = form.getValues("members");
                          update(
                            event.target.checked
                              ? [
                                  ...current,
                                  { id: member.id, version: member.version },
                                ]
                              : current.filter((row) => row.id !== member.id),
                          );
                        }}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <ImportDirectMembers
            form={form}
            draft={draft}
            fields={fields}
            existing={reviewedRoster}
            selectedPeople={selectedPeople}
            duplicates={review.duplicates}
            confirmed={confirmed}
            onConfirm={(value) => setConfirmation(value ? fingerprint : null)}
            busy={action.isPending || uncertain}
            onAppend={() =>
              void draft.handleSubmit((values) => {
                if (fields.length >= 500) return;
                append({ ...values, match: "", parseError: "" });
                draft.reset({ name: "", phoneLast4: "", label: "" });
                form.clearErrors("root");
                action.reset();
              })()
            }
            onRemove={(index) => {
              remove(index);
              form.clearErrors("root");
              action.reset();
            }}
          />
          {stale && (
            <div
              role="alert"
              className="space-y-2 rounded-control bg-soft p-4 text-sm"
            >
              <p>
                선택한 구성원 정보가 바뀌었거나 명단에서 제외됐어요. 최신 명단을
                확인하고 다시 선택해 주세요.
              </p>
              <Button
                variant="outline"
                disabled={uncertain || action.isPending}
                onClick={() => update([])}
              >
                최신 명단으로 다시 선택
              </Button>
            </div>
          )}
          {rosterChanged && (
            <div role="alert" className="space-y-2 text-sm">
              <p>
                행사 명단이 바뀌었어요. 작성한 내용은 유지하고 최신 참여자
                정보를 다시 확인해 주세요.
              </p>
              <Button
                variant="outline"
                disabled={uncertain || action.isPending}
                onClick={() => {
                  setReviewedRoster(existing);
                  form.clearErrors();
                  action.reset();
                }}
              >
                최신 명단으로 다시 검토
              </Button>
            </div>
          )}
          <FormError message={form.formState.errors.members?.message} />
          <FormError message={form.formState.errors.root?.message} />
          <FormError
            message={
              action.error
                ? uncertain
                  ? "추가 결과를 확인하지 못했어요. 선택과 요청을 유지하고 다시 확인할 수 있어요."
                  : safeErrorMessage(action.error)
                : undefined
            }
          />
        </div>
        <div className="mt-auto pt-7">
          {uncertain ? (
            <Button
              className="w-full"
              loading={action.isPending}
              onClick={save}
            >
              같은 요청 다시 확인
            </Button>
          ) : (
            <Button
              className="w-full"
              type="submit"
              loading={action.isPending}
              disabled={
                (!selected.length && !direct.length) || stale || rosterChanged
              }
            >
              참여자 추가하기
            </Button>
          )}
        </div>
      </form>
      {leaving && (
        <Dialog
          labelledBy="import-leave-title"
          onClose={() => setLeaving(false)}
        >
          <h2 id="import-leave-title" className="text-label">
            작성 중인 명단을 나갈까요?
          </h2>
          <p className="mt-3 text-sm text-secondary">
            선택한 구성원과 직접 입력한 내용이 저장되지 않아요.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLeaving(false)}
            >
              계속 작성
            </Button>
            <Button className="flex-1" onClick={onClose}>
              나가기
            </Button>
          </div>
        </Dialog>
      )}
    </StepLayout>
  );
}
