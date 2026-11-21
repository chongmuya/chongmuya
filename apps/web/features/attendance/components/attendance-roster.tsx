"use client";
import { useState } from "react";
import Image from "next/image";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import { stateLabel } from "../lib/attendance-labels";
import type {
  AttendanceAnswer,
  AttendanceCounts,
  RoundDetailDto,
} from "../types/attendance.types";

export function AttendanceRoster({
  people,
  counts,
  saving,
  onCorrect,
}: {
  people: RoundDetailDto["participants"];
  counts: AttendanceCounts;
  saving: boolean;
  onCorrect: (
    person: RoundDetailDto["participants"][number],
    value: AttendanceAnswer | null,
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [attendingOnly, setAttendingOnly] = useState(false);
  const term = search.trim();
  const shown = people.filter(
    (person) =>
      (!attendingOnly || person.response.finalState === "ATTENDING") &&
      [person.name, person.label, person.phoneLast4].some((value) =>
        value?.includes(term),
      ),
  );
  return (
    <div className="space-y-3">
      <div className="relative">
        <Image
          src="/images/groups/search.svg"
          alt=""
          width={20}
          height={20}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label="명단 검색"
          className="min-h-control rounded-[14px] border-transparent pl-10 text-xs shadow-control"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="이름 · 전화번호 뒤 4자리 · 메모"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 px-2">
        <div
          role="group"
          aria-label="최종 참석 집계"
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-secondary min-[380px]:gap-x-3"
        >
          <span>
            참석{" "}
            <strong className="text-xl text-brand">{counts.attending}</strong>명
          </span>
          <span>
            불참 <strong className="text-xl">{counts.absent}</strong>명
          </span>
          <span>
            미응답 <strong className="text-xl">{counts.unanswered}</strong>명
          </span>
        </div>
        <label className="ml-auto flex min-h-control cursor-pointer items-center gap-2 text-xs">
          참석만 보기
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={attendingOnly}
            onChange={(event) => setAttendingOnly(event.target.checked)}
          />
          <span
            aria-hidden="true"
            className="flex h-4 w-8 items-center justify-end rounded-pill bg-placeholder px-px shadow-control peer-checked:justify-start peer-checked:bg-brand peer-focus-visible:focus-outline"
          >
            <Image
              src="/images/attendance/filter-thumb.svg"
              alt=""
              width={13}
              height={13}
            />
          </span>
        </label>
      </div>
      {shown.length ? (
        <table className="w-full table-fixed">
          <caption className="sr-only">참여자 참석 명단</caption>
          <thead className="border-b border-placeholder text-left text-xs text-secondary">
            <tr>
              <th
                scope="col"
                className="w-[27%] pb-1 pl-3 font-normal min-[380px]:pl-5"
              >
                이름
              </th>
              <th scope="col" className="pb-1 font-normal">
                전화번호 뒷자리
              </th>
              <th
                scope="col"
                className="w-[92px] pb-1 pr-3 text-center font-normal min-[380px]:w-[100px] min-[380px]:pr-5"
              >
                참석 여부
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((person) => {
              const state = person.response.finalState;
              const next = state === "ATTENDING" ? "ABSENT" : "ATTENDING";
              return (
                <tr key={person.id}>
                  <th
                    scope="row"
                    className="py-1.5 pr-2 pl-3 text-left text-sm font-semibold wrap-anywhere min-[380px]:pl-5"
                  >
                    {person.name}
                    {person.label && (
                      <span className="block text-xs font-normal text-secondary">
                        {person.label}
                      </span>
                    )}
                  </th>
                  <td className="text-base font-medium text-secondary tabular-nums">
                    {person.phoneLast4 ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-center min-[380px]:pr-5">
                    <button
                      type="button"
                      aria-label={`${person.name} ${stateLabel(state)} · ${stateLabel(next)}으로 변경`}
                      aria-disabled={saving}
                      onClick={() => {
                        if (!saving) onCorrect(person, next);
                      }}
                      className="mx-auto grid min-h-control w-20 cursor-pointer place-items-center rounded-pill aria-disabled:cursor-wait aria-disabled:opacity-60"
                    >
                      <span
                        className={cn(
                          "relative flex h-8 w-full items-center rounded-pill border text-xs transition-colors",
                          state === "ATTENDING" &&
                            "justify-end border-transparent bg-brand pr-3 text-white shadow-control",
                          state === "ABSENT" &&
                            "justify-start border-transparent bg-placeholder pl-3 text-copy shadow-control",
                          state === "UNANSWERED" &&
                            "justify-center border-border bg-transparent text-secondary",
                        )}
                      >
                        {state !== "UNANSWERED" && (
                          <Image
                            src="/images/attendance/response-thumb.svg"
                            alt=""
                            width={26}
                            height={26}
                            className={cn(
                              "absolute top-1",
                              state === "ATTENDING" ? "left-px" : "right-[3px]",
                            )}
                          />
                        )}
                        {stateLabel(state)}
                      </span>
                    </button>
                    {person.response.managerOverride !== null && (
                      <button
                        type="button"
                        aria-label={`${person.name} 정정 해제`}
                        className="mx-auto block min-h-6 cursor-pointer text-xs text-secondary underline disabled:cursor-wait"
                        disabled={saving}
                        onClick={() => onCorrect(person, null)}
                      >
                        정정 해제
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p
          role="status"
          className="rounded-control bg-surface p-5 text-center text-sm text-secondary"
        >
          {people.length
            ? "조건에 맞는 참여자가 없어요."
            : "아직 참여자가 없어요."}
        </p>
      )}
    </div>
  );
}
