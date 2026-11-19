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
    const selected = existing.find((member) => member.id === row.match);
    if (
      row.match &&
      row.match !== "new" &&
      (!selected ||
        selected.name !== row.name ||
        (selected.phoneLast4 ?? "") !== row.phoneLast4 ||
        (selected.label ?? "") !== row.label)
    ) {
      issues.push({
        index,
        field: "match",
        message:
          "선택한 구성원이 변경되거나 삭제됐어요. 최신 정보를 다시 선택하거나 해당 행을 제외해 주세요.",
      });
      return;
    }
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
