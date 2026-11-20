"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { OwnerCheck, OwnerChoice, OwnerField, OwnerTick } from "./owner-fields";
import type { RegistrationData } from "../schemas/registration.schema";

const spaceKinds = [
  ["HALL", "일반 홀 이용"],
  ["WHOLE", "전체 대관"],
  ["FLOOR", "한 층 대관"],
  ["ROOM", "룸"],
] as const;
type Space = RegistrationData["spaces"][number];

function newSpace(kind: Space["kind"], label: string): Space {
  return {
    kind,
    label,
    availability: "AVAILABLE",
    togetherSeating: "UNKNOWN",
    capacity: null,
    minGuests: null,
    minSpend: null,
    separateFee: null,
    conditions: "",
  };
}

export function OwnerSpaceFields({
  capacityUnknown,
  onCapacityUnknownChange,
}: {
  capacityUnknown: boolean;
  onCapacityUnknownChange: (value: boolean) => void;
}) {
  const { control, setValue, formState } = useFormContext<RegistrationData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "spaces",
    keyName: "rowKey",
  });
  const spaces = useWatch({ control, name: "spaces" });
  const [selectedKind, setSelectedKind] = useState<Space["kind"]>();
  const firstActive = spaces.findIndex(
    (s) => s.kind !== "ROOM" && s.availability !== "UNAVAILABLE",
  );
  const selected = spaces.findIndex(
    (s) => s.kind === selectedKind && s.availability !== "UNAVAILABLE",
  );
  const descriptionIndex = selected === -1 ? firstActive : selected;
  const activeRooms = spaces.filter(
    (s) => s.kind === "ROOM" && s.availability !== "UNAVAILABLE",
  );
  const spaceError = formState.errors.spaces;

  function selectSpace(kind: Space["kind"], label: string) {
    if (kind !== "ROOM") setSelectedKind(kind);
    const index = spaces.findIndex((space) => space.kind === kind);
    if (index === -1) {
      if (spaces.length < 30)
        append(newSpace(kind, label), { shouldFocus: false });
      return;
    }
    if (
      !spaces.some(
        (space) => space.kind === kind && space.availability !== "UNAVAILABLE",
      )
    )
      setValue(`spaces.${index}.availability`, "AVAILABLE");
  }

  return (
    <>
      <div className="space-y-2">
        <OwnerField
          numeric
          path="maxCapacity"
          label="매장 수용 인원"
          required
          disabled={capacityUnknown}
          placeholder="예) 40"
        />
        <OwnerCheck
          tick
          checked={capacityUnknown}
          onChange={(event) => {
            onCapacityUnknownChange(event.target.checked);
            if (event.target.checked) setValue("maxCapacity", null);
          }}
        >
          <span className="text-xs">아직 정확한 인원을 모르겠어요</span>
        </OwnerCheck>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-label text-copy/80">
          공간 이용 형태
          <span className="text-brand" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {spaceKinds.slice(0, 3).map(([kind, label]) => {
            const active = spaces.some(
              (space) =>
                space.kind === kind && space.availability !== "UNAVAILABLE",
            );
            return (
              <Button
                key={kind}
                variant="outline"
                aria-pressed={active}
                className="min-h-8 gap-1.5 border-transparent bg-surface px-2 py-1 text-xs font-medium text-copy shadow-control"
                onClick={() => selectSpace(kind, label)}
              >
                <span className="relative size-6 shrink-0 rounded-full border border-placeholder">
                  {active && <OwnerTick className="-m-px" />}
                </span>
                {label}
              </Button>
            );
          })}
        </div>
        {descriptionIndex !== -1 && (
          <OwnerField
            key={fields[descriptionIndex]?.rowKey}
            path={`spaces.${descriptionIndex}.conditions`}
            hideLabel
            label="공간 추가 설명"
            placeholder="공간에 대한 추가 설명을 입력해주세요"
          />
        )}
        <FormError message={spaceError?.message} />
      </fieldset>
      <OwnerCheck
        tick
        checked={activeRooms.length > 0}
        onChange={(event) => {
          if (event.target.checked) selectSpace("ROOM", "룸");
          else
            spaces.forEach((space, i) => {
              if (space.kind === "ROOM")
                setValue(`spaces.${i}.availability`, "UNAVAILABLE");
            });
        }}
      >
        룸 대관이 가능해요
      </OwnerCheck>
      {(fields.length > 0 || spaceError) && (
        <details className="space-y-4" open={spaceError ? true : undefined}>
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            공간별 상세 조건
          </summary>
          {fields.map((field, i) => (
            <section
              key={field.rowKey}
              className="space-y-4 rounded-card bg-surface p-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-bold">공간 {i + 1}</h2>
                {!field.id && (
                  <Button variant="outline" onClick={() => remove(i)}>
                    입력 취소
                  </Button>
                )}
              </div>
              <OwnerChoice
                path={`spaces.${i}.kind`}
                label="공간 유형"
                options={spaceKinds}
              />
              <OwnerField
                path={`spaces.${i}.label`}
                label="공간 이름"
                required
                placeholder="예) 룸 A"
              />
              <div className="grid grid-cols-2 gap-3">
                <OwnerField
                  numeric
                  path={`spaces.${i}.capacity`}
                  label="수용 인원"
                />
                <OwnerField
                  numeric
                  path={`spaces.${i}.minGuests`}
                  label="최소 예약 인원"
                />
              </div>
              <OwnerField
                numeric
                path={`spaces.${i}.minSpend`}
                label="최소 이용금액 (원, 없음은 0)"
              />
              <OwnerField
                numeric
                path={`spaces.${i}.separateFee`}
                label="별도 대관료 (원, 없음은 0)"
              />
              <OwnerChoice
                path={`spaces.${i}.togetherSeating`}
                label="함께 착석"
                options={[
                  ["UNKNOWN", "확인 필요"],
                  ["YES", "가능"],
                  ["NO", "분리 착석"],
                ]}
              />
              <OwnerChoice
                path={`spaces.${i}.availability`}
                label="운영 상태"
                options={[
                  ["UNKNOWN", "확인 필요"],
                  ["AVAILABLE", "운영 중"],
                  ["UNAVAILABLE", "이용 중단"],
                ]}
              />
              {i !== descriptionIndex && (
                <OwnerField path={`spaces.${i}.conditions`} label="추가 조건" />
              )}
            </section>
          ))}
          {fields.length < 30 && (
            <Button
              className="w-full"
              variant="brand-outline"
              onClick={() =>
                append(newSpace("HALL", ""), { shouldFocus: false })
              }
            >
              공간 추가
            </Button>
          )}
        </details>
      )}
    </>
  );
}
