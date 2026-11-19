import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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
  type ReservationPrincipal,
} from "./types/reservation-completion.js";
import { proposalSchema } from "./types/merchant-reply.js";
import { calculateOrder } from "./lib/reservation-completion.js";
const resultCommand = commandSchema
  .extend({
    changeId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
    agreement: proposalSchema.optional(),
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
    refundExpected: money.nullable(),
  })
  .strict();
const acceptCommand = commandSchema
  .extend({ changeId: z.uuid(), confirmed: z.literal(true) })
  .strict();
const rejectCommand = commandSchema
  .extend({ changeId: z.uuid(), reason: z.string().trim().min(1).max(500) })
  .strict();
@Injectable()
export class ReservationChangesService {
  constructor(
    private readonly completion: ReservationCompletionService,
    private readonly payments: ReservationPaymentsService,
    private readonly restaurants: RestaurantsService,
    private readonly events: EventsService,
  ) {}
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
        await c.m.insert(ReservationChange, {
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
        const agreement = input.agreement ?? c.state.agreement;
        if (
          change.kind === "CHANGE" &&
          (Date.parse(agreement.startsAt) <= Date.now() ||
            (agreement.menuDeadlineAt &&
              Date.parse(agreement.menuDeadlineAt) >
                Date.parse(agreement.startsAt)))
        )
          throw new DomainHttpException("VALIDATION_FAILED");
        const guidance = input.guidance
          ? this.payments.validateGuidance(
              { ...c, state: { ...c.state, agreement } },
              input.guidance,
            )
          : { ...c.state.guidance, revision: c.state.guidance.revision + 1 };
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
        if (
          order &&
          (order.total < (agreement.minimumSpend ?? 0) ||
            order.lines.reduce((n, l) => n + l.quantity, 0) <
              (agreement.minimumQuantity ?? 0))
        )
          throw new DomainHttpException("RESERVATION_MENU_INVALID");
        if (
          input.refundExpected !== null &&
          (input.refundExpected > (c.state.receipt?.amount ?? 0) ||
            input.refundExpected < c.state.refunded)
        )
          throw new DomainHttpException("VALIDATION_FAILED");
        if (
          change.kind === "CANCEL" &&
          (input.agreement || input.menu || input.guidance)
        )
          throw new DomainHttpException("VALIDATION_FAILED");
        change.proposal = {
          agreement,
          order,
          guidance,
          refundExpected: input.refundExpected,
          reason: input.reason,
          audit: c.audit,
        };
        change.status = "PROPOSED";
        await c.m.save(change);
        await this.completion.notify(
          c,
          "CHANGE_PROPOSED",
          "매장이 변경·취소 처리 내용을 제안했어요. 내용을 확인하고 수락하면 적용돼요.",
          "organizer",
          guidance.kind === "REQUIRED" && guidance.channel === "SMS"
            ? `${guidance.amount}원 · ${guidance.deadline}\n${guidance.bank} ${guidance.account} ${guidance.holder}`
            : "",
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
        this.completion.active(c);
        const change = await c.m.findOneBy(ReservationChange, {
          id: input.changeId,
          reservationId: id,
          status: "PROPOSED",
        });
        if (!change?.proposal)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        const proposal = change.proposal,
          s = c.state;
        if (change.kind === "CANCEL") {
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
          s.agreement = proposal.agreement;
          s.agreementRevision++;
          s.guidance = proposal.guidance;
          s.order = proposal.order;
          s.acknowledgedRevision = s.guidance.revision;
          s.acknowledgedAt = new Date().toISOString();
          s.exceptionResolution = null;
          // Confirmation snapshots stay in history. The revised agreement must meet its own conditions.
          s.confirmation = null;
          await this.events.setReservationSchedule(
            c.selection.eventId,
            s.agreement.startsAt,
            true,
            c.m,
          );
        }
        change.status = "APPLIED";
        change.resolvedAt = new Date();
        await c.m.save(change);
        await this.completion.notify(
          c,
          "CHANGE_APPLIED",
          change.kind === "CANCEL"
            ? "예약 취소가 완료됐어요. 환불은 별도로 확인해 주세요."
            : "총무가 변경 제안을 수락했어요. 새 합의 조건과 남은 확인 사항을 확인해 주세요.",
          "both",
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
        this.completion.active(c);
        const change = await c.m.findOneBy(ReservationChange, {
          id: input.changeId,
          reservationId: id,
          status: In(["REQUESTED", "PROPOSED"]),
        });
        if (!change)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        change.status = "REJECTED";
        change.resolvedAt = new Date();
        await c.m.save(change);
        c.audit.reason = input.reason;
        await this.completion.notify(
          c,
          "CHANGE_REJECTED",
          "변경·취소 문의의 처리 결과가 등록됐어요. 기존 예약 조건은 유지돼요.",
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
          s.refundExpected === null ||
          Date.parse(input.refundedAt) > Date.now() ||
          s.refunded + input.amount > (s.receipt?.amount ?? 0) ||
          s.refunded + input.amount > s.refundExpected
        )
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        s.refunded += input.amount;
        c.audit = {
          ...c.audit,
          reason: input.reason,
          confirmedAt: input.refundedAt,
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
      "REFUND_PLAN",
      commandSchema
        .extend({ amount: money, reason: z.string().trim().min(1).max(500) })
        .strict(),
      raw,
      "merchant",
      async (c, input) => {
        if (
          !c.state.cancellation ||
          input.amount > (c.state.receipt?.amount ?? 0) ||
          input.amount < c.state.refunded
        )
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        c.state.refundExpected = input.amount;
        c.audit.reason = input.reason;
        await this.completion.notify(
          c,
          "REFUND_PLAN",
          "매장이 환불 예정액을 확인했어요. 실제 반환 확인과 구분해 주세요.",
          "organizer",
        );
      },
    );
  }
}
