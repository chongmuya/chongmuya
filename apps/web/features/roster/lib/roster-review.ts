import type { ExistingPerson } from "./parse-roster";
import type { RosterRow } from "./parse-roster";
import { duplicateNames } from "./parse-roster";

export function reviewRoster(rows: RosterRow[], existing: ExistingPerson[]) {
  const fresh = rows.filter((row) => !row.match || row.match === "new");
  const duplicates = duplicateNames([...existing, ...fresh]).filter((name) =>
    fresh.some((row) => row.name.trim() === name),
  );
  const issues: { index: number; field: "match" | "label"; message: string }[] =
    [];
  rows.forEach((row, index) => {
    const matches = existing.filter(
      (member) =>
        member.name.normalize("NFC") === row.name.trim().normalize("NFC"),
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
