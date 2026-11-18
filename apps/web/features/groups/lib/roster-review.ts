import type { GroupMember } from "../types/group.types";
import type { RosterRow } from "./parse-roster";
import { duplicateNames } from "./parse-roster";

export function reviewRoster(rows: RosterRow[], existing: GroupMember[]) {
  const fresh = rows.filter((row) => !row.match || row.match === "new");
  const duplicates = duplicateNames([...existing, ...fresh]).filter((name) =>
    fresh.some((row) => row.name.trim() === name),
  );
  const issues: { index: number; field: "match" | "label"; message: string }[] =
    [];
  rows.forEach((row, index) => {
    const matches = existing.filter(
      (member) => member.name === row.name.trim(),
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
    if (row.match && row.match !== "new") return;
    if (!duplicates.includes(row.name.trim())) return;
    const label = row.label.trim();
    if (
      !label ||
      existing.some((m) => m.name === row.name.trim() && m.label === label) ||
      fresh.some(
        (m) =>
          m !== row &&
          m.name.trim() === row.name.trim() &&
          m.label.trim() === label,
      )
    )
      issues.push({
        index,
        field: "label",
        message: "동명이인을 구분할 서로 다른 표시를 입력해 주세요.",
      });
  });
  return { duplicates, issues, addedCount: fresh.length };
}
