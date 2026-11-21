import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { AuthService } from "../auth/auth.service.js";
import {
  ReservationCompletionService,
  type CompletionContext,
} from "./reservation-completion.service.js";
import {
  issueGuidanceCommand,
  transferCommand,
  receiptCommand,
  acknowledgeCommand,
  resolveCommand,
  type ReservationPrincipal,
  type DepositGuidance,
} from "./types/reservation-completion.js";
import { sameGuidance } from "./lib/completion-sms-policy.js";
import { guidanceReady } from "./lib/reservation-completion.js";

@Injectable()
export class ReservationPaymentsService {
  constructor(
    private readonly completion: ReservationCompletionService,
    private readonly auth: AuthService,
  ) {}
  validateGuidance(
    c: CompletionContext,
    input: {
      kind: "NONE" | "REQUIRED";
      amount: number;
      deadline: string | null;
      channel: "WEB" | "SMS";
      bank: string;
      account: string;
      holder: string;
      policy: string;
      webConsent: boolean;
    },
  ): DepositGuidance {
    if (
      input.kind === "REQUIRED" &&
      (!input.amount ||
        !input.deadline ||
        Date.parse(input.deadline) > Date.parse(c.state.agreement.startsAt) ||
        !input.bank ||
        !input.account ||
        !input.holder ||
        (input.channel === "WEB" && !input.webConsent))
    )
      throw new DomainHttpException("VALIDATION_FAILED");
    if (input.kind === "NONE" && input.amount !== 0)
      throw new DomainHttpException("VALIDATION_FAILED");
    return {
      revision: c.state.guidance.revision + 1,
      kind: input.kind,
      amount: input.amount,
      deadline: input.kind === "NONE" ? null : input.deadline,
      channel: input.channel,
      bank: input.kind === "NONE" ? "" : input.bank,
      account: input.kind === "NONE" ? "" : input.account,
      holder: input.kind === "NONE" ? "" : input.holder,
      policy: input.policy,
      issuedAt: new Date().toISOString(),
      audit: c.audit,
    };
  }
  guidance(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "GUIDANCE",
      issueGuidanceCommand,
      raw,
      "merchant",
      async (c, input) => {
        this.completion.active(c);
        if (c.state.confirmation)
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        let account = null;
        if (input.depositAccountRevision !== undefined) {
          if (p.kind !== "owner" || input.kind !== "REQUIRED")
            throw new DomainHttpException("RESERVATION_ACCESS_INVALID");
          account = await this.auth.ownerDepositAccount(p.user.id, c.m, true);
          if (!account || account.revision !== input.depositAccountRevision)
            throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        }
        const guidance = this.validateGuidance(c, { ...input, ...account });
        if (sameGuidance(c.state.guidance, guidance)) return;
        c.state.guidance = guidance;
        c.state.acknowledgedRevision = null;
        c.state.exceptionResolution = null;
        await this.completion.notify(
          c,
          "GUIDANCE",
          "예약금 안내가 도착했어요. 금액·기한·변경 조건을 확인해 주세요.",
          "organizer",
        );
      },
    );
  }
  acknowledge(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "GUIDANCE_ACKNOWLEDGED",
      acknowledgeCommand,
      raw,
      "organizer",
      async (c, input) => {
        this.completion.active(c);
        if (input.guidanceRevision !== c.state.guidance.revision)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        if (!guidanceReady(c.state))
          throw new DomainHttpException("RESERVATION_GUIDANCE_PENDING");
        c.state.acknowledgedRevision = input.guidanceRevision;
        c.state.acknowledgedAt = new Date().toISOString();
      },
    );
  }
  transfer(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "TRANSFER_REPORTED",
      transferCommand,
      raw,
      "organizer",
      async (c, input) => {
        this.completion.active(c);
        if (input.guidanceRevision > c.state.guidance.revision)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        const previous = c.state.transfer;
        if (
          previous?.guidanceRevision === input.guidanceRevision &&
          previous.payer === input.payer &&
          previous.amount === input.amount
        )
          return;
        c.state.transfer = {
          guidanceRevision: input.guidanceRevision,
          payer: input.payer,
          amount: input.amount,
          reportedAt: new Date().toISOString(),
        };
        await this.completion.notify(
          c,
          "TRANSFER_REPORTED",
          "총무가 송금했다고 신고했어요. 은행 내역과 실제 수령액을 대조해 주세요.",
          "merchant",
        );
      },
    );
  }
  receipt(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "RECEIPT_RECORDED",
      receiptCommand,
      raw,
      "merchant",
      async (c, input) => {
        // Late bank evidence does not reopen a cancelled reservation. Only the
        // established audited PHONE/SMS operator path can record this exception.
        if (c.state.cancellation && p.kind !== "operator")
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        const s = c.state;
        if (
          input.guidanceRevision !== s.guidance.revision ||
          input.corrects !== (s.receipt?.id ?? null)
        )
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        if (
          Date.parse(input.receivedAt) > Date.now() ||
          input.amount < s.refunded
        )
          throw new DomainHttpException("VALIDATION_FAILED");
        c.audit.reason = input.reason;
        s.receipt = {
          id: randomUUID(),
          guidanceRevision: input.guidanceRevision,
          amount: input.amount,
          receivedAt: input.receivedAt,
          recordedAt: new Date().toISOString(),
          audit: { ...c.audit, reason: input.reason },
          corrects: input.corrects,
        };
        s.exceptionResolution = null;
        await this.completion.notify(
          c,
          "RECEIPT_RECORDED",
          s.cancellation
            ? "취소된 예약의 실제 수령액을 확인·정정했어요. 예약은 취소 상태로 유지되며 반환 내역과 함께 확인해 주세요."
            : "매장이 실제 수령액을 확인했어요. 남은 예약 조건을 확인해 주세요.",
          "organizer",
        );
      },
    );
  }
  resolve(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "EXCEPTION_RESOLVED",
      resolveCommand,
      raw,
      "merchant",
      async (c, input) => {
        this.completion.active(c);
        c.audit.reason = input.reason;
        c.state.exceptionResolution = {
          at: new Date().toISOString(),
          reason: input.reason,
          audit: c.audit,
        };
        await this.completion.notify(
          c,
          "EXCEPTION_RESOLVED",
          "매장이 기한·금액 예외를 확인하고 기존 예약의 재진행을 기록했어요.",
          "organizer",
        );
      },
    );
  }
}
