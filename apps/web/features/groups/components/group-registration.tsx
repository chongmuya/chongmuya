"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";
import {
  duplicateNames,
  MAX_ROSTER_BYTES,
  parseRoster,
} from "../lib/parse-roster";
import {
  groupRegistrationSchema,
  type GroupRegistrationValues,
} from "../schemas/group-registration.schema";
import { useSaveGroup } from "../hooks/use-save-group";
import type { Group } from "../types/group.types";
import { RosterPreview } from "./roster-preview";

type Step = "group" | "input" | "preview";
export function GroupRegistration({
  accountId,
  request,
  onNavigate,
}: {
  accountId: string;
  request: SessionRequest;
  onNavigate: (path: string) => void;
}) {
  const id = useId();
  const active = useActiveScreen();
  const [step, setStep] = useState<Step>("group");
  const [completed, setCompleted] = useState<Group | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmedRows, setConfirmedRows] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const requestKey = useRef<string | null>(null);
  const previousSkip = useRef(false);
  const submitting = useRef(false);
  const fileVersion = useRef(0);
  const parsedSource = useRef<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useForm<GroupRegistrationValues>({
    resolver: zodResolver(groupRegistrationSchema),
    defaultValues: { name: "", groupType: "", source: "", members: [] },
    shouldUnregister: false,
  });
  const { fields, replace, remove, append } = useFieldArray({
    control: form.control,
    name: "members",
  });
  const rows = useWatch({ control: form.control, name: "members" });
  const fingerprint = JSON.stringify(rows);
  const duplicates = duplicateNames(rows);
  const confirmed = confirmedRows === fingerprint;
  const save = useSaveGroup(accountId, request, undefined, (group) =>
    setCompleted(group),
  );
  const busy = save.isPending || fileBusy;
  const {
    register,
    formState: { errors, isDirty },
    clearErrors,
    setError,
    setValue,
  } = form;

  useEffect(() => {
    container.current?.querySelector("h1")?.focus();
  }, [step]);
  useEffect(() => {
    if (!isDirty || completed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, completed]);

  const persist = async (values: GroupRegistrationValues, skip = false) => {
    if (submitting.current) return;
    if (!skip && duplicates.length && !confirmed) {
      setError("root.server", {
        message: "같은 이름의 구성원을 확인해 주세요.",
      });
      return;
    }
    submitting.current = true;
    requestKey.current ??= crypto.randomUUID();
    previousSkip.current = skip;
    clearErrors("root.server");
    try {
      await save.mutateAsync({
        name: values.name,
        groupType: values.groupType || null,
        creationKey: requestKey.current,
        members: skip
          ? []
          : values.members.map(({ name, phoneLast4 }) => ({
              name,
              phoneLast4: phoneLast4 || null,
            })),
        duplicatesConfirmed: !skip && confirmed,
      });
    } catch (error) {
      if (active.current)
        applyFormError(error, setError, {
          name: "name",
          groupType: "groupType",
        });
    } finally {
      submitting.current = false;
    }
  };
  const preview = () => {
    clearErrors();
    try {
      const source = form.getValues("source");
      if (parsedSource.current === source) {
        setStep("preview");
        return;
      }
      const parsed = parseRoster(source);
      if (!parsed.length) {
        setError("source", {
          message: "명단을 입력하거나, 명단 없이 모임을 만들어 주세요.",
        });
        return;
      }
      parsedSource.current = source;
      replace(parsed);
      setStep("preview");
      void form.trigger("members");
    } catch (error) {
      setError("source", {
        message:
          error instanceof Error ? error.message : "명단을 읽지 못했어요.",
      });
    }
  };
  const readFile = async (file: File) => {
    const version = ++fileVersion.current;
    clearErrors("source");
    if (
      !file.name.toLowerCase().endsWith(".txt") ||
      file.size > MAX_ROSTER_BYTES
    ) {
      setError("source", {
        message: "128KB 이하의 UTF-8 TXT 파일을 선택해 주세요.",
      });
      return;
    }
    setFileBusy(true);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      const parsed = parseRoster(text);
      if (!active.current || version !== fileVersion.current) return;
      if (!parsed.length) {
        setError("source", { message: "파일에 등록할 명단이 없어요." });
        return;
      }
      parsedSource.current = text;
      setValue("source", text, { shouldDirty: true });
      replace(parsed);
      setStep("preview");
      void form.trigger("members");
    } catch {
      if (active.current && version === fileVersion.current)
        setError("source", {
          message:
            "TXT를 읽지 못했어요. UTF-8 텍스트인지 확인하거나 명단을 직접 붙여넣어 주세요.",
        });
    } finally {
      if (active.current && version === fileVersion.current) setFileBusy(false);
    }
  };
  const previous = () => {
    if (step === "group") {
      if (isDirty) setLeaving(true);
      else onNavigate("/");
    } else {
      clearErrors("root.server");
      setStep(step === "preview" ? "input" : "group");
    }
  };

  return (
    <div ref={container}>
      <StepLayout
        title="모임 등록"
        onBack={previous}
        busy={busy}
        progress={{ value: step === "group" ? 1 : 2, max: 2 }}
      >
        <form
          noValidate
          className="flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            if (step === "group")
              void form.trigger(["name", "groupType"]).then((valid) => {
                if (valid && active.current) setStep("input");
              });
            else if (step === "input") preview();
            else void form.handleSubmit((values) => persist(values))(event);
          }}
        >
          <fieldset disabled={busy} className="min-w-0 px-[17px]">
            {step === "group" ? (
              <>
                <StepHeading title="어떤 모임을 관리하시나요?" />
                <p className="-mt-10 mb-12 text-control leading-normal text-muted">
                  모임을 만들고 행사 내역을 한곳에서 관리해 보세요.
                </p>
                <div className="space-y-12">
                  <FormField
                    id={`${id}-name`}
                    label="모임 이름"
                    required
                    labelClassName="text-label"
                    error={errors.name?.message}
                  >
                    {(attributes) => (
                      <Input
                        {...attributes}
                        {...register("name")}
                        variant="pill"
                        className="shadow-control"
                        placeholder="예) 사진 소모임"
                        autoComplete="off"
                      />
                    )}
                  </FormField>
                  <FormField
                    id={`${id}-type`}
                    label="모임 유형 (선택)"
                    labelClassName="text-label"
                    error={errors.groupType?.message}
                  >
                    {(attributes) => (
                      <Input
                        {...attributes}
                        {...register("groupType")}
                        list={`${id}-types`}
                        variant="pill"
                        className="shadow-control"
                        placeholder="예) 동아리"
                      />
                    )}
                  </FormField>
                  <datalist id={`${id}-types`}>
                    <option value="동아리" />
                    <option value="학생회" />
                    <option value="학회" />
                    <option value="친목 모임" />
                  </datalist>
                </div>
              </>
            ) : (
              <>
                <StepHeading title="구성원을 한 번에 등록해요" />
                <p className="-mt-10 mb-12 text-control leading-normal text-muted">
                  명단을 붙여넣거나 파일을 불러오면 여러 명을 한 번에 추가할 수
                  있어요.
                </p>
                {step === "input" ? (
                  <div className="space-y-5">
                    <FormField
                      id={`${id}-source`}
                      label="명단 직접 입력 · 붙여넣기"
                      labelClassName="text-label"
                      hint="한 줄에 한 명씩, 이름과 뒤 4자리는 탭으로 구분해 주세요. 시트에서 복사해도 좋아요."
                      error={errors.source?.message}
                    >
                      {(attributes) => (
                        <textarea
                          {...attributes}
                          {...register("source")}
                          className="min-h-[200px] w-full resize-y rounded-card bg-surface px-4 py-3.5 text-control leading-6 shadow-control placeholder:text-placeholder"
                          placeholder={"김총무\n이회장\t0012\n김민지"}
                        />
                      )}
                    </FormField>
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".txt,text/plain"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void readFile(file);
                      }}
                    />
                    <Button
                      className="w-full gap-2 rounded-control"
                      variant="brand-outline"
                      onClick={() => fileInput.current?.click()}
                    >
                      <span className="relative">
                        <Image
                          src="/images/groups/txt.svg"
                          alt=""
                          width={18.1111}
                          height={23}
                        />
                        <span className="absolute bottom-0.5 left-0.5 text-[6px] text-muted">
                          TXT
                        </span>
                      </span>
                      {fileBusy ? "파일 읽는 중…" : "TXT 파일로 등록하기"}
                    </Button>
                    {rows.length > 0 && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setStep("preview")}
                      >
                        수정하던 명단 {rows.length}명으로 돌아가기
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={rows.length >= 500}
                      onClick={() => {
                        parsedSource.current ??= form.getValues("source");
                        append({ name: "", phoneLast4: "", parseError: "" });
                        setStep("preview");
                      }}
                    >
                      한 명씩 직접 추가하기
                    </Button>
                  </div>
                ) : (
                  <RosterPreview
                    form={form}
                    fields={fields}
                    duplicates={duplicates}
                    confirmed={confirmed}
                    onConfirm={(value) =>
                      setConfirmedRows(value ? fingerprint : null)
                    }
                    onRemove={remove}
                    onAppend={() =>
                      append({ name: "", phoneLast4: "", parseError: "" })
                    }
                  />
                )}
              </>
            )}
          </fieldset>
          <div className="mt-auto space-y-2 bg-background pt-8 pb-2">
            <FormError message={errors.root?.server?.message} />
            {save.isError && (
              <p className="text-xs text-muted">
                입력은 유지돼요. 다시 눌러도 같은 모임이 중복 생성되지 않아요.
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              variant={step === "preview" ? "solid" : "brand-outline"}
              disabled={
                busy ||
                (step === "preview" &&
                  (!fields.length || (duplicates.length > 0 && !confirmed)))
              }
              loading={save.isPending}
            >
              {step === "group"
                ? "다음"
                : step === "input"
                  ? "명단 확인하기"
                  : save.isPending
                    ? "저장 중…"
                    : "등록 완료"}
            </Button>
            {step !== "group" && (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  if (requestKey.current && !previousSkip.current) {
                    setError("root.server", {
                      message:
                        "진행한 등록 결과가 불확실해요. 같은 명단으로 다시 저장하거나 홈에서 확인해 주세요.",
                    });
                    return;
                  }
                  const values = form.getValues();
                  void persist(
                    {
                      ...values,
                      name: values.name.trim(),
                      groupType: values.groupType.trim(),
                      members: [],
                    },
                    true,
                  );
                }}
              >
                명단 없이 모임 만들기
              </Button>
            )}
          </div>
        </form>
      </StepLayout>
      {completed && (
        <Dialog
          showCloseButton
          labelledBy={`${id}-complete`}
          onClose={() => onNavigate(`/?group=${completed.id}`)}
          className="max-w-[322px] space-y-7 text-center"
        >
          <Image
            className="mx-auto"
            src="/images/ui/success.svg"
            alt=""
            width={48}
            height={48}
          />
          <div>
            <h2 id={`${id}-complete`} className="text-2xl font-bold">
              모임이 만들어졌어요!
            </h2>
            <p className="mt-2 break-words text-caption text-muted">
              {completed.name}
              {completed.memberCount > 0
                ? ` · 명단 ${completed.memberCount}명 등록 완료`
                : " · 명단 없이 등록 완료"}
            </p>
            <p className="mt-2 text-control text-muted">
              이제 첫 행사를 준비해 볼까요?
            </p>
          </div>
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => onNavigate(`/events?group=${completed.id}`)}
            >
              행사 등록하기
            </Button>
            <Button
              className="w-full"
              variant="brand-outline"
              onClick={() => onNavigate(`/?group=${completed.id}`)}
            >
              홈으로 가기
            </Button>
          </div>
        </Dialog>
      )}
      {leaving && (
        <Dialog labelledBy={`${id}-leave`} onClose={() => setLeaving(false)}>
          <h2 id={`${id}-leave`} className="text-label">
            모임 등록을 나가시겠어요?
          </h2>
          <p className="my-4 text-caption text-muted">
            아직 저장하지 않은 입력은 사라져요. 모임은 나중에 만들어도 괜찮아요.
          </p>
          <div className="space-y-2">
            <Button className="w-full" onClick={() => setLeaving(false)}>
              계속 작성하기
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => onNavigate("/")}
            >
              홈으로 나가기
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
