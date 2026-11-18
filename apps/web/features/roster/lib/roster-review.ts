import type { ExistingPerson } from "./parse-roster";
import type { RosterRow } from "./parse-roster";
import { duplicateNames, normalizeName } from "./parse-roster";

export function reviewRoster(rows: RosterRow[], existing: ExistingPerson[]) {
  const fresh = rows.filter((row) => !row.match || row.match === "new");
  const duplicates = duplicateNames([...existing, ...fresh]).filter((name) =>
    fresh.some((row) => normalizeName(row.name) === name),
  );
  const issues: { index: number; field: "match" | "label"; message: string }[] =
    [];
  rows.forEach((row, index) => {
    const matches = existing.filter(
      (member) => normalizeName(member.name) === normalizeName(row.name),
    );
    if (
      matches.length &&
      (!row.match ||
        (row.match !== "new" && !matches.some((m) => m.id === row.match)))
    )
      issues.push({
        index,
        field: "match",
        message: "기존 구성원인지 새 동명이인인지 선택해 주세요.",
      });
  });
  return { duplicates, issues, addedCount: fresh.length };
}
