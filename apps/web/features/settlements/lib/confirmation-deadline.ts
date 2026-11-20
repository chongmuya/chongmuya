import { isDateOnly, koreanDateOnly } from "@/shared/lib/korean-date";
import type { Detail } from "../types/settlement.types";

export function confirmationDeadline(data: Detail, now = new Date()) {
  // Notices are appended in their creation order. A new notice with no deadline
  // deliberately replaces the previous deadline for this guidance.
  const latest = data.state.notices.at(-1);
  if (
    !latest ||
    !isDateOnly(latest.deadline) ||
    koreanDateOnly(now) <= latest.deadline
  )
    return null;
  const people = data.summary.people.filter((person) => person.remaining > 0);
  if (!people.length) return null;
  return {
    noticeId: latest.id,
    deadline: latest.deadline,
    people,
    amount: people.reduce((sum, person) => sum + person.remaining, 0),
    calculationChanged:
      latest.calculationVersion !== data.state.calculationVersion,
    ownerChanged: latest.ownerChanged,
  };
}
