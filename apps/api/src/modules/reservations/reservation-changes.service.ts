import { ReservationLocksService } from "./reservation-locks.service.js";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { In } from "typeorm";
import { z } from "zod";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { EventsService } from "../events/events.service.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationCompletionService } from "./reservation-completion.service.js";
import { ReservationPaymentsService } from "./reservation-payments.service.js";
import { ReservationChange } from "./entities/reservation-progress.entity.js";
import {
  commandSchema,
  changeCommand,
  refundCommand,
  guidanceCommand,
  itemsSchema,
  money,
  type DepositGuidance,
  type MenuOrder,
  type ReservationPrincipal,
} from "./types/reservation-completion.js";
import { proposalSchema, type Proposal } from "./types/merchant-reply.js";
import { calculateOrder } from "./lib/reservation-completion.js";
import { sameGuidance } from "./lib/completion-sms-policy.js";
const resultCommand = commandSchema
  .extend({
    changeId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
    agreement: proposalSchema.partial().optional(),
    menu: z
      .object({
        catalogVersion: z.number().int().positive(),
        items: itemsSchema,
      })
      .strict()
      .optional(),
    guidance: guidanceCommand
      .omit({ requestKey: true, expectedVersion: true })
      .optional(),
    refundExpected: money.nullable().default(null),
  })
  .strict();
const acceptCommand = commandSchema
  .extend({ changeId: z.uuid(), confirmed: z.literal(true) })
  .strict();
const rejectCommand = commandSchema
  .extend({ changeId: z.uuid(), reason: z.string().trim().min(1).max(500) })
  .strict();
const declineCommand = commandSchema.extend({ changeId: z.uuid() }).strict();

function validateOrder(order: MenuOrder | null, agreement: Proposal) {
  if (
    order &&
    (order.total < (agreement.minimumSpend ?? 0) ||
      order.lines.reduce((n, line) => n + line.quantity, 0) <
        (agreement.minimumQuantity ?? 0))
  )
    throw new DomainHttpException("RESERVATION_MENU_INVALID");
}

function validateDepositDeadline(
  guidance: DepositGuidance,
  agreement: Proposal,
) {
  if (
    guidance.kind === "REQUIRED" &&
    guidance.deadline &&
    Date.parse(guidance.deadline) > Date.parse(agreement.startsAt)
  )
    throw new DomainHttpException("VALIDATION_FAILED", [
      { field: "deadline", code: "INVALID_VALUE" },
    ]);
}

function sameDepositTerms(current: DepositGuidance, next: DepositGuidance) {
  return sameGuidance(current, {
    ...next,
    channel: current.channel,
    policy: current.policy,
  });
}
@Injectable()
export class ReservationChangesService {
  constructor(
    private readonly locks: ReservationLocksService,
    private readonly completion: ReservationCompletionService,
    private readonly payments: ReservationPaymentsService,
    private readonly restaurants: RestaurantsService,
    private readonly events: EventsService,
  ) {}
  private validateAgreement(agreement: Proposal) {
    if (Date.parse(agreement.startsAt) <= Date.now())
      throw new DomainHttpException("VALIDATION_FAILED", [
        { field: "startsAt", code: "INVALID_VALUE" },
      ]);
    if (
      agreement.menuDeadlineAt &&
      Date.parse(agreement.menuDeadlineAt) > Date.parse(agreement.startsAt)
    )
      throw new DomainHttpException("VALIDATION_FAILED", [
        { field: "menuDeadlineAt", code: "INVALID_VALUE" },
      ]);
  }
  request(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "CHANGE_REQUESTED",
      changeCommand,
      raw,
      "organizer",
      async (c, input) => {
        this.completion.active(c);
        if (
          await c.m.existsBy(ReservationChange, {
            reservationId: id,
            status: In(["REQUESTED", "PROPOSED"]),
          })
        )
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        c.change = await c.m.save(ReservationChange, {
          id: randomUUID(),
          reservationId: id,
          kind: input.kind,
          subject: input.subject,
          reason: input.reason,
          status: "REQUESTED",
          createdAt: new Date(),
        });
        await this.completion.notify(
          c,
          "CHANGE_REQUESTED",
          "변경·취소 문의가 접수됐어요. 접수만으로 예약이나 환불이 바뀌지 않아요.",
          "merchant",
        );
      },
    );
  }
  propose(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "CHANGE_PROPOSED",
      resultCommand,
      raw,
      "merchant",
      async (c, input) => {
        this.completion.active(c);
        const change = await c.m.findOneBy(ReservationChange, {
          id: input.changeId,
          reservationId: id,
          status: "REQUESTED",
        });
        if (!change)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        if (
          change.kind === "CANCEL" &&
          (input.agreement || input.menu || input.guidance)
        )
          throw new DomainHttpException("VALIDATION_FAILED");
        const agreementEdits = Object.fromEntries(
          (Object.keys(input.agreement ?? {}) as (keyof Proposal)[])
            .filter(
              (field) =>
                !isDeepStrictEqual(
                  input.agreement?.[field],
                  c.state.agreement[field],
                ),
            )
            .map((field) => [field, input.agreement?.[field]]),
        ) as Partial<Proposal>;
        const agreement = { ...c.state.agreement, ...agreementEdits };
        if (change.kind === "CHANGE") {
          if (input.refundExpected !== null)
            throw new DomainHttpException("VALIDATION_FAILED", [
              { field: "refundExpected", code: "INVALID_VALUE" },
            ]);
          this.validateAgreement(agreement);
        }
        const proposedGuidance = input.guidance
          ? this.payments.validateGuidance(
              { ...c, state: { ...c.state, agreement } },
              input.guidance,
            )
          : c.state.guidance;
        const guidanceEdited = !sameGuidance(
          c.state.guidance,
          proposedGuidance,
        );
        const guidance = guidanceEdited ? proposedGuidance : c.state.guidance;
        if (change.kind === "CHANGE")
          validateDepositDeadline(guidance, agreement);
        let order = c.state.order;
        if (input.menu)
          order = calculateOrder(
            await this.restaurants.reservationMenu(
              c.target.restaurantId,
              c.m,
              true,
            ),
            input.menu.items,
            input.menu.catalogVersion,
            agreement,
            (order?.revision ?? 0) + 1,
          );
        validateOrder(order, agreement);
        if (
          input.refundExpected !== null &&
          (input.refundExpected > (c.state.receipt?.amount ?? 0) ||
            input.refundExpected < c.state.refunded)
        )
          throw new DomainHttpException("VALIDATION_FAILED");
        if (change.kind === "CHANGE") {
          await this.locks.responsibleAccounts(c.request, c.m);
        }
        change.proposal = {
          agreement,
          order,
          guidance,
          refundExpected: input.refundExpected,
          reason: input.reason,
          audit: c.audit,
          ...(change.kind === "CHANGE" && {
            edits: {
              agreement: agreementEdits,
              order: !!input.menu,
              guidance: guidanceEdited,
            },
          }),
        };
        change.status = "PROPOSED";
        c.change = await c.m.save(change);
        await this.completion.notify(
          c,
          "CHANGE_PROPOSED",
          "매장이 변경·취소 처리 내용을 제안했어요. 내용을 확인하고 수락하면 적용돼요.",
          "organizer",
        );
      },
    );
  }
  accept(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.apply(id, p, raw, false);
  }
  acceptOperator(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.apply(id, p, raw, true);
  }
  private apply(
    id: string,
    p: ReservationPrincipal,
    raw: unknown,
    operator: boolean,
  ) {
    const schema = operator
      ? acceptCommand
          .extend({
            organizerConfirmer: z.string().trim().min(1).max(100),
            merchantConfirmer: z.string().trim().min(1).max(100),
            agreementEvidence: z.string().trim().min(1).max(1000),
          })
          .strict()
      : acceptCommand;
    return this.completion.write(
      id,
      p,
      "CHANGE_APPLIED",
      schema,
      raw,
      operator ? "operator" : "organizer",
      async (c, input) => {
        const change = await c.m.findOneBy(ReservationChange, {
          id: input.changeId,
          reservationId: id,
          status: "PROPOSED",
        });
        if (!change?.proposal)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        const proposal = change.proposal,
          s = c.state;
        if (change.kind === "REFUND") {
          if (
            !s.cancellation ||
            proposal.refundExpected === null ||
            proposal.refundExpected > (s.receipt?.amount ?? 0)
          )
            throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
          s.refundExpected = proposal.refundExpected;
        } else if (change.kind === "CANCEL") {
          this.completion.active(c);
          if (
            proposal.refundExpected !== null &&
            proposal.refundExpected > (s.receipt?.amount ?? 0)
          )
            throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
          s.cancellation = {
            at: new Date().toISOString(),
            reason: change.reason,
            audit: c.audit,
          };
          s.refundExpected = proposal.refundExpected;
          c.selection.cancelledAt = new Date();
          await this.events.setReservationSchedule(
            c.selection.eventId,
            s.agreement.startsAt,
            false,
            c.m,
          );
        } else {
          this.completion.active(c);
          if (proposal.refundExpected !== null)
            throw new DomainHttpException("VALIDATION_FAILED");
          const edits = proposal.edits;
          const agreement = edits
            ? { ...s.agreement, ...edits.agreement }
            : proposal.agreement;
          const order = edits && !edits.order ? s.order : proposal.order;
          const guidance =
            edits && !edits.guidance ? s.guidance : proposal.guidance;
          this.validateAgreement(agreement);
          validateOrder(order, agreement);
          validateDepositDeadline(guidance, agreement);
          await this.locks.responsibleAccounts(c.request, c.m);
          const scheduleChanged = agreement.startsAt !== s.agreement.startsAt;
          const guidanceChanged = !sameGuidance(s.guidance, guidance);
          const conditionsChanged =
            !isDeepStrictEqual(agreement, s.agreement) ||
            order !== s.order ||
            guidanceChanged;
          const depositChanged = !sameDepositTerms(s.guidance, guidance);
          if (
            depositChanged ||
            agreement.menuDeadlineAt !== s.agreement.menuDeadlineAt
          )
            s.exceptionResolution = null;
          if (guidanceChanged) {
            s.guidance = {
              ...guidance,
              revision: s.guidance.revision + (depositChanged ? 1 : 0),
            };
            s.acknowledgedRevision = s.guidance.revision;
            s.acknowledgedAt = new Date().toISOString();
          }
          s.agreement = agreement;
          s.order = order;
          if (conditionsChanged) {
            s.agreementRevision++;
            s.confirmation = null;
          }
          if (scheduleChanged)
            await this.events.setReservationSchedule(
              c.selection.eventId,
              s.agreement.startsAt,
              true,
              c.m,
            );
        }
        change.status = "APPLIED";
        change.resolvedAt = new Date();
        c.change = await c.m.save(change);
        await this.completion.notify(
          c,
          "CHANGE_APPLIED",
          change.kind === "REFUND"
            ? "총무가 환불 예정액을 수락했어요. 실제 반환은 별도로 확인해 주세요."
            : change.kind === "CANCEL"
              ? "예약 취소가 완료됐어요. 환불은 전화로 협의해 주세요."
              : "총무가 변경 제안을 수락했어요. 새 합의 조건과 남은 확인 사항을 확인해 주세요.",
          "both",
        );
      },
    );
  }
  decline(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "CHANGE_DECLINED",
      declineCommand,
      raw,
      "organizer",
      async (c, input) => {
        this.completion.active(c);
        const change = await c.m.findOneBy(ReservationChange, {
          id: input.changeId,
          reservationId: id,
          kind: In(["CHANGE", "CANCEL"]),
          status: "PROPOSED",
        });
        if (!change)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        change.status = "REJECTED";
        change.resolvedAt = new Date();
        c.change = await c.m.save(change);
        await this.completion.notify(
          c,
          "CHANGE_DECLINED",
          "총무가 제안을 거절했어요. 기존 예약 조건으로 진행해 주세요.",
          "merchant",
        );
      },
    );
  }
  reject(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "CHANGE_REJECTED",
      rejectCommand,
      raw,
      "merchant",
      async (c, input) => {
        const change = await c.m.findOneBy(ReservationChange, {
          id: input.changeId,
          reservationId: id,
          status: In(["REQUESTED", "PROPOSED"]),
        });
        if (!change)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        if (change.kind === "REFUND") {
          if (!c.state.cancellation)
            throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        } else this.completion.active(c);
        change.status = "REJECTED";
        change.resolvedAt = new Date();
        c.change = await c.m.save(change);
        c.audit.reason = input.reason;
        await this.completion.notify(
          c,
          "CHANGE_REJECTED",
          change.kind === "REFUND"
            ? "환불 예정액 제안이 철회됐어요. 기존 합의 금액은 유지돼요."
            : "변경·취소 문의의 처리 결과가 등록됐어요. 기존 예약 조건은 유지돼요.",
          "organizer",
        );
      },
    );
  }
  refund(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "REFUND_RECORDED",
      refundCommand,
      raw,
      "merchant",
      async (c, input) => {
        const s = c.state;
        if (
          !s.cancellation ||
          Date.parse(input.refundedAt) > Date.now() ||
          s.refunded + input.amount > (s.receipt?.amount ?? 0)
        )
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        s.refunded += input.amount;
        c.evidence = {
          refund: {
            amount: input.amount,
            refundedAt: input.refundedAt,
            expected: s.refundExpected,
            totalReturned: s.refunded,
            variance:
              s.refundExpected === null ? null : s.refunded - s.refundExpected,
          },
        };
        c.audit = {
          ...c.audit,
          reason: input.reason,
        };
        await this.completion.notify(
          c,
          "REFUND_RECORDED",
          `반환 사실 ${input.amount}원이 기록됐어요. 총 반환액 ${s.refunded}원이에요.`,
          "organizer",
        );
      },
    );
  }
  refundPlan(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "REFUND_PROPOSED",
      commandSchema
        .extend({ amount: money, reason: z.string().trim().min(1).max(500) })
        .strict(),
      raw,
      "merchant",
      async (c, input) => {
        if (
          !c.state.cancellation ||
          input.amount > (c.state.receipt?.amount ?? 0)
        )
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        if (
          await c.m.existsBy(ReservationChange, {
            reservationId: id,
            status: In(["REQUESTED", "PROPOSED"]),
          })
        )
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        c.audit.reason = input.reason;
        await c.m.insert(ReservationChange, {
          id: randomUUID(),
          reservationId: id,
          kind: "REFUND",
          subject: "OTHER",
          reason: "환불 예정액 합의",
          status: "PROPOSED",
          proposal: {
            agreement: c.state.agreement,
            order: c.state.order,
            guidance: c.state.guidance,
            refundExpected: input.amount,
            reason: input.reason,
            audit: c.audit,
          },
          createdAt: new Date(),
          resolvedAt: null,
        });
        await this.completion.notify(
          c,
          "REFUND_PROPOSED",
          "매장이 환불 예정액을 제안했어요. 총무가 수락하기 전에는 기존 합의 금액이 유지돼요.",
          "organizer",
        );
      },
    );
  }
}
