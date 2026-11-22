import { fromKoreanDateInput, koreanDateInput } from "@/shared/lib/korean-date";
import type { Agreement } from "../types/completion.types";

export function proposalAgreement(
  values: Record<string, string>,
  base: Agreement,
  enabled: (field: string) => boolean,
): Partial<Agreement> {
  const agreement: Partial<Agreement> = {};
  const copy = <K extends keyof Agreement>(
    field: K,
    value: Agreement[K],
    previous: Agreement[K] = base[field],
  ) => {
    if (enabled(field) && value !== previous) agreement[field] = value;
  };
  const startsAt = fromKoreanDateInput(values.startsAt);
  if (startsAt && values.startsAt !== koreanDateInput(base.startsAt))
    copy("startsAt", startsAt);
  const menuDeadline = fromKoreanDateInput(values.menuDeadlineAt);
  if (
    (menuDeadline || values.menuDeadlineAt === "") &&
    values.menuDeadlineAt !== koreanDateInput(base.menuDeadlineAt)
  )
    copy("menuDeadlineAt", menuDeadline);
  const guests = Number(values.expectedGuests);
  if (guests > 0) copy("expectedGuests", guests);
  if (values.space) copy("space", values.space as Agreement["space"]);
  if (values.seating) copy("seating", values.seating as Agreement["seating"]);
  const kind = values.usageKind as NonNullable<Agreement["usageTime"]>["kind"];
  const minutes = kind === "MINUTES" ? Number(values.usageMinutes) : null;
  if (
    enabled("usageKind") &&
    (kind !== (base.usageTime?.kind ?? "UNKNOWN") ||
      minutes !== (base.usageTime?.minutes ?? null))
  )
    agreement.usageTime = { kind, minutes };
  copy("note", values.note);
  copy(
    "changeCancellationPolicy",
    values.changeCancellationPolicy || null,
    base.changeCancellationPolicy ?? null,
  );
  copy(
    "minimumSpend",
    values.minimumSpend ? Number(values.minimumSpend) : null,
  );
  copy(
    "minimumQuantity",
    values.minimumQuantity ? Number(values.minimumQuantity) : null,
    base.minimumQuantity ?? null,
  );
  copy("separateFee", values.separateFee ? Number(values.separateFee) : null);
  return agreement;
}
