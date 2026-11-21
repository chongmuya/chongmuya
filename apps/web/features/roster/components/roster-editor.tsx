"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";
import {
  parseRoster,
  rosterTable,
  emptyRosterRow,
  MAX_ROSTER_BYTES,
  MAX_ROSTER_MEMBERS,
  type ExistingPerson,
  type RosterRow,
} from "../lib/parse-roster";
import { reviewRoster } from "../lib/roster-review";
import { rosterSchema, type RosterDraft } from "../schemas/roster.schema";
import { RosterPreview } from "./roster-preview";

export function RosterEditor({
  existing = [],
  title = "명단 등록",
  progress,
  busy = false,
  onSave,
  onBack,
}: {
  existing?: ExistingPerson[];
  title?: string;
  progress?: { value: number; max: number };
  busy?: boolean;
  onSave: (rows: RosterRow[], confirmed: boolean) => Promise<void>;
  onBack: () => void;
}) {
  const id = useId(),
    active = useActiveScreen();
  const [step, setStep] = useState<"input" | "preview">("input");
  const [fileBusy, setFileBusy] = useState(false),
    [confirmedRows, setConfirmedRows] = useState<string | null>(null);
  const parsedSource = useRef<string | null>(null),
    submitting = useRef(false),
    fileVersion = useRef(0);
  const directValues = useRef(
    new Map<string, Pick<RosterRow, "name" | "phoneLast4" | "label">>(),
  );
  const form = useForm<RosterDraft>({
    resolver: zodResolver(rosterSchema),
    defaultValues: { source: "", members: [] },
    shouldUnregister: false,
  });
  const { fields, append, insert, remove, replace } = useFieldArray({
    control: form.control,
    name: "members",
  });
  const watchedRows = useWatch({ control: form.control, name: "members" });
  // Field array changes render before useWatch receives the new row values.
  const rows =
    watchedRows.length === fields.length
      ? watchedRows
      : form.getValues("members");
  const review = reviewRoster(rows, existing),
    fingerprint = JSON.stringify([rows, existing]),
    confirmed = confirmedRows === fingerprint;
  const [table, setTable] = useState<ReturnType<typeof rosterTable>>(null);
  const [nameColumn, setNameColumn] = useState(""),
    [phoneColumn, setPhoneColumn] = useState(""),
    [header, setHeader] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    register,
    setError,
    clearErrors,
    formState: { errors, isDirty },
  } = form;
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
  const openPreview = (addEmpty = false, source = form.getValues("source")) => {
    clearErrors();
    try {
      const changed = parsedSource.current !== source;
      const next = changed ? parseRoster(source) : form.getValues("members");
      if (addEmpty && next.length >= MAX_ROSTER_MEMBERS)
        throw new Error("명단은 한 번에 500명까지 등록할 수 있어요.");
      if (!addEmpty && !next.length)
        throw new Error("명단을 입력하거나 한 명씩 직접 추가해 주세요.");
      if (changed) {
        replace(next);
        directValues.current.clear();
        const sourceTable = rosterTable(source);
        setTable(sourceTable?.inferred ? null : sourceTable);
        setNameColumn("");
        setPhoneColumn("");
        setHeader(false);
      }
      if (addEmpty) append(emptyRosterRow());
      parsedSource.current = source;
      form.setValue("source", source, { shouldDirty: true });
      setStep("preview");
      if (!addEmpty) void form.trigger("members");
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
      if (active.current && version === fileVersion.current)
        openPreview(false, text);
    } catch {
      if (active.current)
        setError("source", {
          message: "TXT를 읽지 못했어요. UTF-8 텍스트인지 확인해 주세요.",
        });
    } finally {
      if (active.current && version === fileVersion.current) setFileBusy(false);
    }
  };
  const persist = async (values: RosterDraft) => {
    if (submitting.current) return;
    if (review.issues.length) {
      for (const issue of review.issues)
        setError(`members.${issue.index}.${issue.field}`, {
          message: issue.message,
        });
      form.setFocus(`members.${review.issues[0].index}.name`);
      return;
    }
    if (review.duplicates.length && !confirmed) {
      setError("root.server", {
        message: "같은 이름의 구성원을 확인해 주세요.",
      });
      return;
    }
    submitting.current = true;
    clearErrors("root.server");
    try {
      await onSave(values.members, confirmed);
    } catch (error) {
      if (active.current)
        setError("root.server", { message: safeErrorMessage(error) });
    } finally {
      submitting.current = false;
    }
  };
  return (
    <StepLayout
      title={title}
      progress={progress}
      onBack={() => {
        if (step === "preview") {
          clearErrors("root.server");
          setStep("input");
        } else onBack();
      }}
      busy={busy || fileBusy}
    >
      <form
        noValidate
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || fileBusy) return;
          if (step === "input") openPreview();
          else
            void form.handleSubmit(persist, (invalid) => {
              const index = invalid.members?.findIndex?.(Boolean);
              if (index !== undefined && index >= 0)
                form.setFocus(`members.${index}.name`);
            })(event);
        }}
      >
        <fieldset disabled={busy || fileBusy} className="min-w-0 px-[17px]">
          {step === "input" ? (
            <>
              <StepHeading
                title="구성원을 한 번에 등록해요"
                description="명단을 붙여넣거나 파일을 불러오면 여러 명을 한 번에 추가할 수 있어요."
                className="text-brand-ink"
                descriptionClassName="mt-2 max-w-[327px] text-control leading-[normal] font-medium text-black/50"
              />
              <FormField
                id={`${id}-source`}
                label="명단 붙여넣기"
                error={errors.source?.message}
                className="gap-2"
                labelClassName="text-label text-black/80"
              >
                {(attributes) => (
                  <>
                    <p
                      id={`${id}-hint`}
                      className="text-xs leading-[normal] text-black/80"
                    >
                      한 줄에 한 명씩 입력해 주세요. 엑셀이나 구글 시트에서
                      복사한 명단도 붙여넣을 수 있어요.
                    </p>
                    <textarea
                      {...attributes}
                      {...register("source")}
                      aria-describedby={[
                        `${id}-hint`,
                        attributes["aria-describedby"],
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      autoComplete="off"
                      className="mt-3 min-h-[200px] w-full resize-y rounded-card bg-surface px-4 py-3.5 text-control leading-normal shadow-control placeholder:text-placeholder"
                      placeholder={"김총무\n이회장\n박부장\n김민지"}
                    />
                  </>
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
                className="mt-5 min-h-[50px] w-full gap-2 rounded-control text-sm leading-[normal] text-black/80"
                variant="brand-outline"
                onClick={() => fileInput.current?.click()}
              >
                <span aria-hidden="true" className="relative shrink-0">
                  <Image
                    src="/images/groups/txt.svg"
                    alt=""
                    width={18.1111}
                    height={23}
                  />
                  <span className="absolute top-[14px] left-[2.5px] text-[6px] leading-none font-bold text-black/50">
                    TXT
                  </span>
                </span>
                {fileBusy ? "파일 읽는 중…" : "TXT 파일로 등록하기"}
              </Button>
              <button
                type="button"
                className="mx-auto mt-2 flex min-h-control cursor-pointer items-center gap-1.5 rounded-control px-3 text-sm font-medium text-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
                disabled={rows.length >= MAX_ROSTER_MEMBERS}
                onClick={() => openPreview(true)}
              >
                <Image
                  src="/images/groups/roster-add.svg"
                  alt=""
                  width={18}
                  height={18}
                />
                한 명씩 직접 추가하기
              </button>
            </>
          ) : (
            <>
              {table && (
                <section
                  className="mb-5 space-y-3 rounded-control bg-surface p-4"
                  aria-label="명단 열 선택"
                >
                  <h2 className="font-semibold">
                    이름과 연락처 열을 확인해 주세요
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="text-xs">
                      <tbody>
                        {table.cells.slice(0, 3).map((cells, index) => (
                          <tr key={index}>
                            {cells.map((cell, column) => (
                              <td
                                className="border border-border p-2"
                                key={column}
                              >
                                {cell || "빈 셀"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="block">
                    이름 열{" "}
                    <select
                      value={nameColumn}
                      onChange={(event) => setNameColumn(event.target.value)}
                      className="min-h-11"
                    >
                      <option value="">선택해 주세요</option>
                      {Array.from({ length: table.columns }, (_, index) => (
                        <option value={index} key={index}>
                          {index + 1}열
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    연락처 열{" "}
                    <select
                      value={phoneColumn}
                      onChange={(event) => setPhoneColumn(event.target.value)}
                      className="min-h-11"
                    >
                      <option value="">선택해 주세요</option>
                      <option value="none">번호 없음</option>
                      {Array.from({ length: table.columns }, (_, index) => (
                        <option value={index} key={index}>
                          {index + 1}열
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={header}
                      onChange={(event) => setHeader(event.target.checked)}
                    />
                    첫 행은 머리글
                  </label>
                  <Button
                    variant="outline"
                    disabled={
                      !nameColumn || !phoneColumn || nameColumn === phoneColumn
                    }
                    onClick={() => {
                      replace(
                        parseRoster(form.getValues("source"), {
                          name: Number(nameColumn),
                          phone:
                            phoneColumn === "none" ? null : Number(phoneColumn),
                          header,
                        }),
                      );
                      directValues.current.clear();
                      setTable(null);
                      void form.trigger("members");
                    }}
                  >
                    선택한 열로 미리보기
                  </Button>
                </section>
              )}
              <RosterPreview
                form={form}
                existing={existing}
                fields={fields}
                rows={rows}
                directValues={directValues}
                addedCount={review.addedCount}
                duplicates={review.duplicates}
                confirmed={confirmed}
                onConfirm={(value) =>
                  setConfirmedRows(value ? fingerprint : null)
                }
                onRemove={(index) => {
                  directValues.current.delete(fields[index].id);
                  remove(index);
                }}
                onInsert={(index) => insert(index, emptyRosterRow())}
              />
            </>
          )}
        </fieldset>
        <div className="mt-auto space-y-2 pt-8">
          <FormError message={errors.root?.server?.message} />
          <Button
            className={cn("w-full", step === "input" && "border-2 text-brand")}
            variant={step === "input" ? "brand-outline" : "solid"}
            type="submit"
            loading={busy}
            disabled={
              fileBusy ||
              (step === "preview" &&
                (!fields.length ||
                  (review.duplicates.length > 0 && !confirmed)))
            }
          >
            {step === "input" ? "명단 확인하기" : "등록 완료"}
          </Button>
        </div>
      </form>
    </StepLayout>
  );
}
