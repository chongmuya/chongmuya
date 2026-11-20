import type { Agreement } from "../types/completion.types";
import { isoDate } from "./command-values";

export function proposalAgreement(
  values: Record<string, string>,
  base: Agreement,
): Agreement {
  return {
    ...base,
    startsAt: isoDate(values.startsAt),
    expectedGuests: Number(values.expectedGuests),
    space: values.space as Agreement["space"],
    seating: values.seating as Agreement["seating"],
    usageTime: {
      kind: values.usageKind as NonNullable<Agreement["usageTime"]>["kind"],
      minutes:
        values.usageKind === "MINUTES" ? Number(values.usageMinutes) : null,
    },
    note: values.note,
    changeCancellationPolicy: values.changeCancellationPolicy || null,
    menuDeadlineAt: values.menuDeadlineAt
      ? isoDate(values.menuDeadlineAt)
      : null,
    minimumSpend: values.minimumSpend ? Number(values.minimumSpend) : null,
    minimumQuantity: values.minimumQuantity
      ? Number(values.minimumQuantity)
      : null,
    separateFee: values.separateFee ? Number(values.separateFee) : null,
  };
}
