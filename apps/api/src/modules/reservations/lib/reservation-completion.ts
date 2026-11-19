import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import type { SelectedReservation } from "../entities/selected-reservation.entity.js";
import type {
  ReservationPreparation,
  MenuOrder,
  ReservationAudit,
} from "../types/reservation-completion.js";
export function initialPreparation(
  selection: SelectedReservation,
): ReservationPreparation {
  const agreement = selection.snapshot.offered;
  if (!agreement) throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
  return {
    agreementRevision: 1,
    agreement,
    guidance: {
      revision: 1,
      kind:
        agreement.deposit.kind === "NONE"
          ? "NONE"
          : agreement.deposit.kind === "FIXED"
            ? "REQUIRED"
            : "UNKNOWN",
      amount: agreement.deposit.kind === "NONE" ? 0 : agreement.deposit.amount,
      deadline: null,
      channel: "PENDING",
      bank: "",
      account: "",
      holder: "",
      policy: agreement.changeCancellationPolicy ?? "미확인",
      issuedAt: selection.selectedAt.toISOString(),
      audit: null,
    },
    draft: null,
    order: null,
    acknowledgedRevision: null,
    acknowledgedAt: null,
    transfer: null,
    receipt: null,
    exceptionResolution: null,
    confirmation: null,
    refundExpected: null,
    refunded: 0,
    cancellation: null,
  };
}
export function guidanceReady(s: ReservationPreparation) {
  return (
    s.guidance.kind === "NONE" ||
    (s.guidance.kind === "REQUIRED" &&
      !!s.guidance.amount &&
      !!s.guidance.deadline &&
      s.guidance.channel !== "PENDING" &&
      !!s.guidance.bank &&
      !!s.guidance.account &&
      !!s.guidance.holder)
  );
}
export function completionIssues(s: ReservationPreparation, now = Date.now()) {
  const issues: string[] = [];
  if (s.cancellation) return ["CANCELLED"];
  if (!guidanceReady(s)) issues.push("GUIDANCE_PENDING");
  if (!s.order) issues.push("MENU_REQUIRED");
  if (s.acknowledgedRevision !== s.guidance.revision)
    issues.push("GUIDANCE_REVIEW");
  const resolved = s.exceptionResolution
    ? Date.parse(s.exceptionResolution.at)
    : 0;
  const menuDeadline = s.agreement.menuDeadlineAt
    ? Date.parse(s.agreement.menuDeadlineAt)
    : Infinity;
  if (
    (s.order ? Date.parse(s.order.submittedAt) : now) > menuDeadline &&
    resolved < (s.order ? Date.parse(s.order.submittedAt) : now)
  )
    issues.push("MENU_LATE");
  if (s.guidance.kind === "REQUIRED") {
    if (
      !s.receipt ||
      s.receipt.amount - s.refunded < (s.guidance.amount ?? Infinity)
    )
      issues.push("DEPOSIT_UNCONFIRMED");
    const deadline = s.guidance.deadline
      ? Date.parse(s.guidance.deadline)
      : Infinity;
    const receiptTime = s.receipt ? Date.parse(s.receipt.receivedAt) : now;
    if (
      receiptTime > deadline &&
      resolved < (s.receipt ? Date.parse(s.receipt.recordedAt) : now)
    )
      issues.push("PAYMENT_LATE");
    if (
      s.transfer &&
      (s.transfer.guidanceRevision !== s.guidance.revision ||
        s.transfer.amount !== s.guidance.amount ||
        Date.parse(s.transfer.reportedAt) > deadline) &&
      resolved < Date.parse(s.transfer.reportedAt)
    )
      issues.push("TRANSFER_REVIEW");
    if (
      s.receipt &&
      s.receipt.amount - s.refunded !== (s.guidance.amount ?? 0) &&
      resolved < Date.parse(s.receipt.recordedAt)
    )
      issues.push("AMOUNT_REVIEW");
    if (s.receipt && s.receipt.guidanceRevision !== s.guidance.revision)
      issues.push("RECEIPT_REVIEW");
  }
  return issues;
}
export function completionStatus(s: ReservationPreparation, now = Date.now()) {
  if (s.cancellation)
    return s.refundExpected === null || s.refunded > s.refundExpected
      ? "REFUND_REVIEW"
      : s.refunded < s.refundExpected
        ? "REFUND_PENDING"
        : "CANCELLED";
  const issues = completionIssues(s, now);
  if (s.confirmation && !issues.length) return "CONFIRMED";
  if (
    issues.some((i) =>
      [
        "MENU_LATE",
        "PAYMENT_LATE",
        "TRANSFER_REVIEW",
        "AMOUNT_REVIEW",
        "RECEIPT_REVIEW",
      ].includes(i),
    ) ||
    s.confirmation
  )
    return "CHECK_REQUIRED";
  if (!guidanceReady(s)) return "GUIDANCE_PENDING";
  if (!s.order) return "MENU_REQUIRED";
  if (issues.includes("GUIDANCE_REVIEW")) return "GUIDANCE_REVIEW";
  return "PAYMENT_CHECKING";
}
export function calculateOrder(
  catalog: {
    version: number;
    menus: {
      id: string;
      name: string;
      unit: string;
      price: number | null;
      available: boolean;
    }[];
  },
  items: { id: string; quantity: number }[],
  version: number,
  agreement: ReservationPreparation["agreement"],
  revision: number,
): MenuOrder {
  if (catalog.version !== version)
    throw new DomainHttpException("RESERVATION_MENU_CHANGED");
  const lines = items
    .filter((i) => i.quantity > 0)
    .map((i) => {
      const menu = catalog.menus.find((m) => m.id === i.id);
      if (!menu || !menu.available || menu.price === null)
        throw new DomainHttpException("RESERVATION_MENU_CHANGED");
      return {
        id: menu.id,
        name: menu.name,
        unit: menu.unit,
        price: menu.price,
        quantity: i.quantity,
        subtotal: menu.price * i.quantity,
      };
    });
  const total = lines.reduce((n, l) => n + l.subtotal, 0),
    quantity = lines.reduce((n, l) => n + l.quantity, 0);
  if (
    !lines.length ||
    !Number.isSafeInteger(total) ||
    total > 2_000_000_000 ||
    quantity > 100000 ||
    total < (agreement.minimumSpend ?? 0) ||
    quantity < (agreement.minimumQuantity ?? 0)
  )
    throw new DomainHttpException("RESERVATION_MENU_INVALID");
  return {
    revision,
    catalogVersion: catalog.version,
    lines,
    total,
    currency: "KRW",
    submittedAt: new Date().toISOString(),
  };
}
export function advanceConfirmation(
  selection: SelectedReservation,
  s: ReservationPreparation,
  audit: ReservationAudit,
) {
  if (s.cancellation) {
    selection.status = "CANCELLED";
    return false;
  }
  if (completionIssues(s).length) {
    selection.status = s.confirmation ? "CHECK_REQUIRED" : "PREPARING";
    return false;
  }
  const newlyConfirmed = selection.status !== "CONFIRMED";
  if (!s.confirmation)
    s.confirmation = {
      at: new Date().toISOString(),
      audit:
        s.guidance.kind === "REQUIRED" && s.receipt ? s.receipt.audit : audit,
      agreement: structuredClone(s.agreement),
      guidance: structuredClone(s.guidance),
      order: structuredClone(s.order!),
      receivedAmount: s.receipt?.amount ?? 0,
    };
  selection.status = "CONFIRMED";
  return newlyConfirmed;
}
