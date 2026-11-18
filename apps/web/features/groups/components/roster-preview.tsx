import Image from "next/image";
import type { FieldArrayWithId, UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Input } from "@/shared/ui/input";
import { FormError } from "@/shared/ui/form-error";
import type { GroupRegistrationValues } from "../schemas/group-registration.schema";

export function RosterPreview({
  form,
  fields,
  duplicates,
  confirmed,
  onConfirm,
  onRemove,
  onAppend,
}: {
  form: UseFormReturn<GroupRegistrationValues>;
  fields: FieldArrayWithId<GroupRegistrationValues, "members">[];
  duplicates: string[];
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onRemove: (index: number) => void;
  onAppend: () => void;
}) {
  const rows = useWatch({ control: form.control, name: "members" });
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
          <span className="ml-2 text-control text-brand">
            {fields.length}명
          </span>
        </h2>
        <p className="mt-2 text-xs text-muted">
          이름은 필수, 전화번호 뒤 4자리는 선택이에요. 명단을 등록해도 회원
          가입이나 초대가 되지 않아요.
        </p>
      </div>
      {duplicates.length > 0 && (
        <div className="rounded-control bg-brand/10 p-4 shadow-control">
          <div className="flex items-start gap-2">
            <Image
              src="/images/groups/info.svg"
              alt=""
              width={19.5}
              height={19.5}
            />
            <p className="text-xs">
              같은 이름이 {duplicates.length}종류 있어요. 같은 사람을 중복
              입력했다면 해당 행을 제외해 주세요. 동명이인은 뒤 4자리 없이도
              각각 등록할 수 있어요.
            </p>
          </div>
          <label className="mt-3 flex items-start gap-2 text-caption">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-brand"
              checked={confirmed}
              onChange={(e) => onConfirm(e.target.checked)}
            />
            동명이인을 확인했고, 각 행을 별도 구성원으로 등록할게요.
          </label>
        </div>
      )}
      <ol className="divide-y divide-border/50">
        {fields.map((field, index) => {
          const error = errors.members?.[index];
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
                      onChange: () =>
                        setValue(`members.${index}.parseError`, "", {
                          shouldValidate: true,
                        }),
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
                    inputMode="numeric"
                    autoComplete="off"
                    {...register(`members.${index}.phoneLast4`, {
                      onChange: () =>
                        setValue(`members.${index}.parseError`, "", {
                          shouldValidate: true,
                        }),
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
                    width={17.0888}
                    height={17.088}
                  />
                </IconButton>
              </div>
              <FormError
                id={`${field.id}-error`}
                message={
                  error?.name?.message ??
                  error?.phoneLast4?.message ??
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
