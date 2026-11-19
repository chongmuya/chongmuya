import Image from "next/image";
import type { RefObject } from "react";
import type { FieldArrayWithId, UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Input } from "@/shared/ui/input";
import { FormError } from "@/shared/ui/form-error";
import type { ExistingPerson, RosterRow } from "../lib/parse-roster";
import { normalizeName, phoneSuffix } from "../lib/parse-roster";
import { reviewRoster } from "../lib/roster-review";
import type { RosterDraft } from "../schemas/roster.schema";

export function RosterPreview({
  form,
  directValues,
  existing,
  fields,
  duplicates,
  confirmed,
  onConfirm,
  onRemove,
  onAppend,
}: {
  existing: ExistingPerson[];
  directValues: RefObject<
    Map<string, Pick<RosterRow, "name" | "phoneLast4" | "label">>
  >;
  form: UseFormReturn<RosterDraft>;
  fields: FieldArrayWithId<RosterDraft, "members">[];
  duplicates: string[];
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onRemove: (index: number) => void;
  onAppend: () => void;
}) {
  const rows = useWatch({ control: form.control, name: "members" });
  const { addedCount } = reviewRoster(rows, existing);
  const {
    register,
    setValue,
    formState: { errors },
  } = form;
  return (
    <section className="space-y-5" aria-label="가져온 명단 미리보기">
      <div>
        <h2 className="text-label">
          가져온 명단{" "}
          <span className="ml-2 text-control text-brand-action">
            {fields.length}명
          </span>
        </h2>
        <p className="mt-2 text-xs text-muted">
          이름은 필수, 전화번호 뒤 4자리는 선택이에요. 명단을 등록해도 회원
          가입이나 초대가 되지 않아요. 새로 추가할 인원은 {addedCount}명이에요.
        </p>
      </div>
      {duplicates.length > 0 && (
        <div className="rounded-control bg-brand/10 p-4 shadow-control">
          <div className="flex items-start gap-2">
            <Image
              src="/images/groups/info.svg"
              alt=""
              width={20}
              height={20}
            />
            <p className="text-xs">
              같은 이름이 {duplicates.length}종류 있어요. 같은 사람을 중복
              입력했다면 해당 행을 제외해 주세요. 동명이인은 별도로 등록돼요. 뒤
              4자리와 구분 메모는 선택이에요.
            </p>
          </div>
          <label className="mt-3 flex items-start gap-2 text-caption">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-brand"
              checked={confirmed}
              onChange={(e) => onConfirm(e.target.checked)}
            />
            동명이인을 확인했고, 각각 새 구성원으로 등록할게요.
          </label>
        </div>
      )}
      <ol className="divide-y divide-border/50">
        {fields.map((field, index) => {
          const error = errors.members?.[index];
          const row = rows[index];
          const matches = existing.filter(
            (member) =>
              member.id === row?.match ||
              normalizeName(member.name) === normalizeName(row?.name ?? ""),
          );
          const selectedExisting = matches.find(
            (member) => member.id === row?.match,
          );
          const stale =
            !!row?.match &&
            row.match !== "new" &&
            (!selectedExisting ||
              selectedExisting.name !== row.name ||
              (selectedExisting.phoneLast4 ?? "") !== row.phoneLast4 ||
              (selectedExisting.label ?? "") !== row.label);
          const restoreDirect = () => {
            const direct = directValues.current.get(field.id);
            if (direct) {
              setValue(`members.${index}.phoneLast4`, direct.phoneLast4);
              setValue(`members.${index}.label`, direct.label);
            }
          };
          return (
            <li key={field.id} className="py-2">
              <span className="sr-only">구성원 {index + 1}</span>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_44px] items-center gap-2">
                <div>
                  <label className="sr-only" htmlFor={`${field.id}-name`}>
                    {index + 1}번 이름
                  </label>
                  <Input
                    id={`${field.id}-name`}
                    variant="pill"
                    className="border-0 bg-transparent px-2 text-caption font-semibold"
                    placeholder="이름"
                    {...register(`members.${index}.name`, {
                      onChange: () => {
                        if (selectedExisting) restoreDirect();
                        setValue(`members.${index}.match`, "");
                        setValue(`members.${index}.parseError`, "", {
                          shouldValidate: true,
                        });
                      },
                    })}
                    aria-invalid={!!error?.name}
                    aria-describedby={`${field.id}-error`}
                  />
                </div>
                <div>
                  <label className="sr-only" htmlFor={`${field.id}-phone`}>
                    {index + 1}번 전화번호 뒤 4자리 (선택)
                  </label>
                  <Input
                    id={`${field.id}-phone`}
                    variant="pill"
                    className="border-0 bg-transparent px-1 text-caption"
                    placeholder="뒤 4자리 (선택)"
                    readOnly={!!selectedExisting}
                    inputMode="numeric"
                    autoComplete="off"
                    {...register(`members.${index}.phoneLast4`, {
                      onChange: (event) => {
                        setValue(
                          `members.${index}.phoneLast4`,
                          phoneSuffix(event.target.value),
                        );
                        setValue(`members.${index}.parseError`, "", {
                          shouldValidate: true,
                        });
                      },
                    })}
                    aria-invalid={!!error?.phoneLast4}
                    aria-describedby={`${field.id}-error`}
                  />
                </div>
                <IconButton
                  aria-label={`${index + 1}번 구성원 수정`}
                  onClick={() =>
                    form.setFocus(`members.${index}.name`, {
                      shouldSelect: true,
                    })
                  }
                >
                  <Image
                    src="/images/groups/edit.svg"
                    alt=""
                    width={17}
                    height={17}
                  />
                </IconButton>
              </div>
              {(matches.length > 0 || stale) && (
                <div className="mt-2 space-y-1">
                  <label
                    htmlFor={`${field.id}-match`}
                    className="text-xs text-muted"
                  >
                    {index + 1}번 같은 이름의 기존 구성원 확인
                  </label>
                  <select
                    id={`${field.id}-match`}
                    className="min-h-11 w-full rounded-control border border-border bg-surface px-3 text-caption"
                    value={stale ? "" : row.match}
                    aria-invalid={!!error?.match}
                    aria-describedby={`${field.id}-error`}
                    onChange={(event) => {
                      if (!selectedExisting)
                        directValues.current.set(field.id, {
                          name: row.name,
                          phoneLast4: row.phoneLast4,
                          label: row.label,
                        });
                      const match = matches.find(
                        (member) => member.id === event.target.value,
                      );
                      setValue(`members.${index}.match`, event.target.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      if (match) {
                        setValue(`members.${index}.name`, match.name);
                        setValue(
                          `members.${index}.phoneLast4`,
                          match.phoneLast4 ?? "",
                        );
                        setValue(`members.${index}.label`, match.label ?? "");
                      } else {
                        const direct = directValues.current.get(field.id);
                        if (direct)
                          setValue(`members.${index}.name`, direct.name);
                        restoreDirect();
                      }
                    }}
                  >
                    <option value="">선택해 주세요</option>
                    {matches.map((member) => (
                      <option key={member.id} value={member.id}>
                        {[
                          "기존 구성원",
                          member.name,
                          member.label,
                          member.phoneLast4,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </option>
                    ))}
                    <option value="new">새 동명이인으로 등록</option>
                  </select>
                  {stale && (
                    <p role="alert" className="text-xs text-danger">
                      선택한 구성원이 변경되거나 삭제됐어요. 최신 정보를 다시
                      선택하거나 해당 행을 제외해 주세요.
                    </p>
                  )}
                  {selectedExisting && !stale && (
                    <p className="text-xs text-muted">
                      이미 등록된 사람으로 확인했어요. 기존 정보는 바꾸지 않고
                      새로 추가하지 않아요.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-2 space-y-1">
                <label
                  htmlFor={`${field.id}-label`}
                  className="text-xs text-muted"
                >
                  {index + 1}번 구분 표시 (선택)
                </label>
                <Input
                  id={`${field.id}-label`}
                  variant="pill"
                  className="text-caption"
                  placeholder="예) 1반, 운영팀"
                  readOnly={!!selectedExisting}
                  {...register(`members.${index}.label`)}
                  aria-invalid={!!error?.label}
                  aria-describedby={`${field.id}-error`}
                />
              </div>
              <FormError
                id={`${field.id}-error`}
                message={
                  error?.name?.message ??
                  error?.phoneLast4?.message ??
                  error?.match?.message ??
                  error?.label?.message ??
                  error?.parseError?.message ??
                  rows[index]?.parseError
                }
              />
              <div className="text-right">
                <button
                  type="button"
                  className="min-h-8 px-2 text-xs text-muted underline"
                  onClick={() => onRemove(index)}
                  aria-label={`${index + 1}번 구성원 제외`}
                >
                  이 행 제외
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <Button
        variant="outline"
        className="w-full"
        onClick={onAppend}
        disabled={fields.length >= 500}
      >
        구성원 한 명 추가
      </Button>
      <FormError message={errors.members?.root?.message} />
    </section>
  );
}
