"use client";
import { useState } from "react";
import Link from "next/link";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import { stateLabel } from "../lib/attendance-labels";
import type {
  AttendanceAnswer,
  RoundDetailDto,
} from "../types/attendance.types";

export function AttendanceRoster({
  people,
  eventId,
  saving,
  onCorrect,
}: {
  people: RoundDetailDto["participants"];
  eventId: string;
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
    <>
      <label className="block text-sm">
        명단 검색
        <Input
          variant="pill"
          className="mt-2"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="이름, 전화번호 뒤 4자리 또는 메모"
        />
      </label>
      <label className="flex min-h-control w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={attendingOnly}
          onChange={(e) => setAttendingOnly(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className="relative h-5 w-9 rounded-pill bg-secondary/30 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-brand peer-checked:after:translate-x-4 peer-focus-visible:focus-outline"
        />
        참석만 보기
      </label>
      <ul className="divide-y divide-border">
        {shown.map((person) => (
          <li key={person.id} className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <strong className="break-words text-sm">{person.name}</strong>
                {(person.phoneLast4 || person.label) && (
                  <p className="text-xs text-muted">
                    {[person.phoneLast4, person.label]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                {person.response.finalState === "UNANSWERED" && (
                  <span className="mr-2 text-xs text-secondary">미응답</span>
                )}
                <div
                  role="group"
                  aria-label={person.name + " 참석 상태"}
                  className="inline-flex gap-1 rounded-pill bg-soft p-1"
                >
                  {(["ATTENDING", "ABSENT"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={person.response.finalState === value}
                      disabled={saving}
                      onClick={() => onCorrect(person, value)}
                      className={cn(
                        "min-h-control min-w-12 rounded-pill px-3 text-xs font-semibold",
                        person.response.finalState === value
                          ? "bg-brand text-white"
                          : "text-secondary",
                      )}
                    >
                      {stateLabel(value)}
                    </button>
                  ))}
                </div>
                {person.response.managerOverride !== null && (
                  <button
                    type="button"
                    className="ml-auto block py-1 text-xs text-secondary underline"
                    disabled={saving}
                    onClick={() => onCorrect(person, null)}
                  >
                    정정 해제
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {people.length > 0 && shown.length === 0 && (
        <p role="status" className="text-sm text-secondary">
          조건에 맞는 참여자가 없어요.
        </p>
      )}
      {!people.length && (
        <Link
          className="text-sm text-link underline"
          href={`/events?event=${eventId}&view=roster`}
        >
          명단 관리에서 참여자 등록하기
        </Link>
      )}
    </>
  );
}
