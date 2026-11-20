import { useRef } from "react";
import Image from "next/image";
import {
  useWatch,
  type FieldArrayWithId,
  type UseFormReturn,
} from "react-hook-form";
import { normalizeName } from "@/features/roster/client";
import type { ExistingPerson } from "@/features/roster/types";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { FormError } from "@/shared/ui/form-error";
import type {
  ImportDirectInput,
  ImportGroupInput,
} from "../schemas/import-group.schema";

export function ImportDirectMembers({
  form,
  draft,
  fields,
  existing,
  selectedPeople,
  duplicates,
  confirmed,
  onConfirm,
  onAppend,
  onRemove,
  busy,
}: {
  form: UseFormReturn<ImportGroupInput>;
  draft: UseFormReturn<ImportDirectInput>;
  fields: FieldArrayWithId<ImportGroupInput, "directMembers">[];
  existing: ExistingPerson[];
  selectedPeople: ExistingPerson[];
  duplicates: string[];
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onAppend: () => void;
  onRemove: (index: number) => void;
  busy: boolean;
}) {
  const rows = useWatch({ control: form.control, name: "directMembers" });
  const originals = useRef(new Map<string, ImportDirectInput>());
  return (
    <section className="pt-8" aria-labelledby="import-direct-title">
      <h2
        id="import-direct-title"
        className="text-xl leading-[normal] font-semibold"
      >
        직접 입력
      </h2>
      <p className="mt-2 text-xs leading-[normal] text-black/50">
        모임에 없는 사람도 직접 추가할 수 있어요.
      </p>
      <fieldset
        disabled={busy}
        className="mt-4 rounded-card bg-surface p-4 shadow-card"
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            event.target.type !== "checkbox"
          ) {
            event.preventDefault();
            onAppend();
          }
        }}
      >
        <legend className="sr-only">직접 추가할 참여자</legend>
        <div className="space-y-5">
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.76fr)] items-center gap-5">
              <label
                htmlFor="import-direct-name"
                className="text-sm font-semibold"
              >
                이름
              </label>
              <Input
                id="import-direct-name"
                variant="form"
                placeholder="이름을 작성해 주세요"
                {...draft.register("name")}
                aria-invalid={!!draft.formState.errors.name}
                aria-describedby="import-direct-name-error"
                className="min-h-[46px] text-base"
              />
            </div>
            <FormError
              id="import-direct-name-error"
              message={draft.formState.errors.name?.message}
            />
          </div>
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.76fr)] items-center gap-5">
              <label
                htmlFor="import-direct-phone"
                className="text-sm font-semibold break-keep"
              >
                전화번호 뒤 4자리<span className="sr-only"> (선택)</span>
              </label>
              <Input
                id="import-direct-phone"
                variant="form"
                placeholder="예) 3090"
                inputMode="numeric"
                autoComplete="off"
                {...draft.register("phoneLast4")}
                aria-invalid={!!draft.formState.errors.phoneLast4}
                aria-describedby="import-direct-phone-error"
                className="min-h-[46px] text-base"
              />
            </div>
            <FormError
              id="import-direct-phone-error"
              message={draft.formState.errors.phoneLast4?.message}
            />
          </div>
          <Button
            variant="outline"
            className="w-full border-placeholder text-copy"
            onClick={onAppend}
            disabled={fields.length >= 500}
          >
            직접 추가
          </Button>
        </div>
        <FormError message={draft.formState.errors.root?.message} />
        {fields.length > 0 && (
          <ol className="mt-2.5" aria-label="직접 추가한 사람">
            {fields.map((field, index) => {
              const row = rows[index];
              if (!row) return null;
              const matches = existing.filter(
                (person) =>
                  normalizeName(person.name) === normalizeName(row.name) ||
                  person.id === row.match,
              );
              const selectedMatch = matches.find(
                (person) => person.id === row.match,
              );
              const selectedNamesake = selectedPeople.some(
                (person) =>
                  normalizeName(person.name) === normalizeName(row.name),
              );
              const stale =
                !!row.match &&
                row.match !== "new" &&
                (!selectedMatch ||
                  selectedMatch.name !== row.name ||
                  (selectedMatch.phoneLast4 ?? "") !== row.phoneLast4 ||
                  (selectedMatch.label ?? "") !== row.label);
              const error = form.formState.errors.directMembers?.[index];
              return (
                <li key={field.id}>
                  <div className="grid min-h-[59px] grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)_44px] items-center gap-3 pl-[15px]">
                    <span className="text-sm font-semibold break-words">
                      {row.name}
                    </span>
                    <span className="min-w-0 text-base font-medium text-black/50">
                      {row.phoneLast4 || "—"}
                    </span>
                    <IconButton
                      aria-label={`${index + 1}번 직접 입력한 사람 삭제`}
                      onClick={() => {
                        originals.current.delete(field.id);
                        onRemove(index);
                      }}
                    >
                      <Image
                        src="/images/groups/remove-small.svg"
                        alt=""
                        width={18}
                        height={20}
                      />
                    </IconButton>
                  </div>
                  {(matches.length > 0 || selectedNamesake || stale) && (
                    <div className="space-y-2 pb-3">
                      <label
                        htmlFor={`${field.id}-match`}
                        className="text-xs text-secondary"
                      >
                        {index + 1}번 같은 이름의 구성원 확인
                      </label>
                      <Select
                        id={`${field.id}-match`}
                        value={stale ? "" : row.match}
                        className="text-sm"
                        aria-invalid={!!error?.match}
                        onChange={(event) => {
                          if (!selectedMatch)
                            originals.current.set(field.id, {
                              name: row.name,
                              phoneLast4: row.phoneLast4,
                              label: row.label,
                            });
                          const matched = matches.find(
                            (person) => person.id === event.target.value,
                          );
                          const person =
                            matched ?? originals.current.get(field.id) ?? row;
                          form.setValue(
                            `directMembers.${index}`,
                            {
                              ...row,
                              name: person.name,
                              phoneLast4: person.phoneLast4 ?? "",
                              label: person.label ?? "",
                              match: event.target.value,
                            },
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }}
                      >
                        <option value="">선택해 주세요</option>
                        {matches.map((person) => (
                          <option key={person.id} value={person.id}>
                            {[
                              "기존 참여자",
                              person.name,
                              person.phoneLast4,
                              person.label,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </option>
                        ))}
                        <option value="new">새 동명이인으로 등록</option>
                      </Select>
                      {selectedNamesake && (
                        <p className="text-xs text-secondary">
                          선택한 모임 구성원과 같은 사람이라면 직접 입력한 행을
                          삭제해 주세요.
                        </p>
                      )}
                      {selectedMatch && !stale && (
                        <p className="text-xs text-secondary">
                          이미 등록된 참여자예요. 기존 정보는 유지하고 새로
                          추가하지 않아요.
                        </p>
                      )}
                      {stale && (
                        <p role="alert" className="text-xs text-danger">
                          선택한 참여자가 변경됐어요. 최신 정보를 다시 확인해
                          주세요.
                        </p>
                      )}
                    </div>
                  )}
                  <FormError
                    message={
                      error?.match?.message ??
                      error?.name?.message ??
                      error?.phoneLast4?.message
                    }
                  />
                </li>
              );
            })}
          </ol>
        )}
        {duplicates.length > 0 && (
          <label className="mt-3 flex items-start gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-brand"
              checked={confirmed}
              onChange={(event) => onConfirm(event.target.checked)}
            />
            동명이인을 확인했고, 각각 새 구성원으로 등록할게요.
          </label>
        )}
      </fieldset>
    </section>
  );
}
