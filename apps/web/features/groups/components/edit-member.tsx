"use client";
import type { SessionRequest } from "@/features/auth/types";
import type { GroupMember } from "../types/group.types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useEditMember } from "../hooks/use-edit-member";
export function EditMember({
  member,
  groupId,
  request,
  refresh,
  onClose,
}: {
  member: GroupMember;
  groupId: string;
  request: SessionRequest;
  refresh: () => void;
  onClose: () => void;
}) {
  const { base, setBase, uncertain, pending, form, save } = useEditMember(
    member,
    groupId,
    request,
    refresh,
    onClose,
  );
  const changed = base.version !== member.version;
  return (
    <form
      className="w-full space-y-3 rounded-control border border-border p-4"
      onSubmit={(event) =>
        void form.handleSubmit((v) => {
          pending.current ??= {
            ...v,
            phoneLast4: v.phoneLast4 || null,
            label: v.label || null,
            expectedVersion: base.version,
            requestKey: crypto.randomUUID(),
          };
          save.mutate(pending.current);
        })(event)
      }
    >
      <p>
        기본 명단만 수정해요. 이전 행사에 복사된 이름·참석·지출 이력은 그대로
        남아요.
      </p>
      {(["name", "phoneLast4", "label"] as const).map((field, i) => (
        <div key={field}>
          <label htmlFor={`${member.id}-${field}`}>
            {["이름", "전화번호 뒤 4자리", "동명이인 구분"][i]}
          </label>
          <Input
            id={`${member.id}-${field}`}
            {...form.register(field)}
            disabled={save.isPending || uncertain}
            aria-invalid={!!form.formState.errors[field]}
            aria-describedby={`${member.id}-${field}-error`}
          />
          <p id={`${member.id}-${field}-error`} role="alert">
            {form.formState.errors[field]?.message}
          </p>
        </div>
      ))}
      <label className="block">
        <input
          type="checkbox"
          {...form.register("duplicatesConfirmed")}
          disabled={save.isPending || uncertain}
        />{" "}
        동명이인 여부와 구분 정보를 확인했어요
      </label>
      <label className="block">
        <input
          type="checkbox"
          {...form.register("exclude")}
          disabled={save.isPending || uncertain}
        />{" "}
        기본 명단에서 제외해요 (과거 행사 기록 보존)
      </label>
      {changed && (
        <div role="alert">
          <p>
            최신 명단: {member.name} · {member.phoneLast4 ?? "번호 없음"} ·{" "}
            {member.label ?? "구분 없음"}
          </p>
          <Button
            disabled={uncertain || save.isPending}
            variant="outline"
            onClick={() => setBase(member)}
          >
            최신 내용을 확인했고 내 입력을 다시 적용할게요
          </Button>
        </div>
      )}
      {save.isError && (
        <p role="alert">
          {uncertain
            ? "응답을 확인하지 못했어요. 원래 요청을 다시 확인해 주세요."
            : "저장하지 못했어요. 최신 명단과 동명이인 확인 여부를 검토해 주세요."}
        </p>
      )}
      {uncertain ? (
        <Button
          disabled={save.isPending}
          onClick={() => pending.current && save.mutate(pending.current)}
        >
          같은 요청 다시 확인
        </Button>
      ) : (
        <Button type="submit" disabled={save.isPending || changed}>
          변경 저장
        </Button>
      )}
      <Button variant="outline" disabled={save.isPending} onClick={onClose}>
        닫기
      </Button>
    </form>
  );
}
