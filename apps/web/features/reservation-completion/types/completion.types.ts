import type { SessionRequest } from "@/features/auth/types";
export type CompletionAccess =
  | { kind: "organizer" | "owner"; accountId: string; request: SessionRequest }
  | { kind: "link"; access: string; scope: string; accessExpiresAt: string };
export type Agreement = {
  startsAt: string;
  expectedGuests: number;
  space: "ANY" | "HALL" | "ROOM" | "FLOOR" | "WHOLE";
  seating: "ANY" | "CLOSE" | "SEPARATED";
  minimumSpend: number | null;
  separateFee: number | null;
  minimumQuantity?: number | null;
  deposit: {
    kind: "NONE" | "FIXED" | "UNKNOWN" | "PER_RESERVATION";
    amount: number | null;
  };
  menuDeadlineAt: string | null;
  usageTime?: {
    kind: "UNKNOWN" | "UNLIMITED" | "MINUTES";
    minutes: number | null;
  };
  changeCancellationPolicy?: string | null;
  note: string;
};
export type Audit = {
  kind: string;
  recorder: string;
  confirmer: string;
  method: string;
  confirmedAt: string;
  recordedAt: string;
  reason: string;
};
export type Guidance = {
  revision: number;
  kind: "UNKNOWN" | "NONE" | "REQUIRED";
  amount: number | null;
  deadline: string | null;
  channel: "WEB" | "SMS" | "PENDING";
  bank: string;
  account: string;
  holder: string;
  policy: string;
  issuedAt: string;
  audit: Audit | null;
};
export type Order = {
  revision: number;
  catalogVersion: number;
  lines: {
    id: string;
    name: string;
    unit: string;
    price: number;
    quantity: number;
    subtotal: number;
  }[];
  total: number;
  currency: "KRW";
  submittedAt: string;
};
export type Change = {
  id: string;
  kind: "CHANGE" | "CANCEL" | "REFUND";
  subject: string;
  reason: string;
  status: "REQUESTED" | "PROPOSED" | "APPLIED" | "REJECTED";
  createdAt: string;
  resolvedAt: string | null;
  proposal: {
    agreement: Agreement;
    order: Order | null;
    guidance: Guidance;
    refundExpected: number | null;
    reason: string;
    audit: Audit;
  } | null;
};
export type Completion = {
  id: string;
  eventId: string;
  targetId: string;
  restaurantId: string;
  restaurantName: string;
  eventName: string;
  version: number;
  status: "PREPARING" | "CONFIRMED" | "CHECK_REQUIRED" | "CANCELLED";
  progress: string;
  issues: string[];
  agreement: Agreement;
  agreementRevision: number;
  guidance: Guidance;
  draft: {
    catalogVersion: number;
    items: { id: string; quantity: number }[];
  } | null;
  order: Order | null;
  acknowledgedRevision: number | null;
  transfer: {
    guidanceRevision: number;
    payer: string;
    amount: number;
    reportedAt: string;
  } | null;
  receipt: {
    id: string;
    guidanceRevision: number;
    amount: number;
    receivedAt: string;
    recordedAt: string;
    audit: Audit;
    corrects: string | null;
  } | null;
  receivedAmount: number;
  refundedAmount: number;
  refundExpected: number | null;
  cancellation: { at: string; reason: string; audit: Audit } | null;
  confirmation: {
    at: string;
    audit: Audit;
    agreement: Agreement;
    guidance: Guidance;
    order: Order;
    receivedAmount: number;
  } | null;
  changes: Change[];
  history: {
    version: number;
    action: string;
    refund?: {
      amount: number;
      refundedAt: string;
      expected: number | null;
      totalReturned: number;
      variance: number | null;
    };
    agreement: Agreement;
    guidance: Guidance;
    audit: Audit;
    order: Order | null;
    receivedAmount: number;
    refundedAmount: number;
  }[];
  catalog: {
    version: number;
    menus: {
      id: string;
      name: string;
      unit: string;
      price: number | null;
      available: boolean;
    }[];
  };
  notifications: {
    id: string;
    status: string;
    failureStage: string | null;
    errorCode: string | null;
  }[];
};
