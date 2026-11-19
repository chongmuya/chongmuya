import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { EventsService } from "../events/events.service.js";
import { ReservationLocksService } from "./reservation-locks.service.js";
import { ReservationNotificationsService } from "./reservation-notifications.service.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import {
  SelectedReservation,
  ReservationDecision,
} from "./entities/selected-reservation.entity.js";
import { candidateState, terminalCandidate } from "./lib/candidate-state.js";
import type { ReservationDecisionInput } from "./dto/request/reservation-decision.request.dto.js";
import type { CreateReservationRequestInput } from "./dto/request/create-reservation-request.request.dto.js";
@Injectable()
export class ReservationSelectionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly locks: ReservationLocksService,
    private readonly notices: ReservationNotificationsService,
  ) {}
  async decide(
    ownerId: string,
    eventId: string,
    requestId: string,
    action: "SELECT" | "DECLINE",
    input: ReservationDecisionInput,
  ) {
    const db = await this.database.connect();
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          action,
          targetId: input.targetId,
          revision: input.revision,
          expectedVersion: input.expectedVersion,
        }),
      )
      .digest("hex");
    await db.transaction(async (m) => {
      const { event, request, targets } = await this.locks.request(
        requestId,
        m,
      );
      if (event.id !== eventId || event.ownerId !== ownerId)
        throw new NotFoundException();
      const receipt = await m.findOneBy(ReservationDecision, {
        requestId,
        requestKey: input.requestKey,
      });
      if (receipt) {
        if (receipt.digest !== digest)
          throw new DomainHttpException("RESERVATION_RETRY_CONFLICT");
        return;
      }
      const target = targets.find((t) => t.id === input.targetId);
      if (!target) throw new NotFoundException();
      const latest = await m.findOne(ReservationRequest, {
        where: { eventId },
        order: { round: "DESC" },
      });
      if (
        request.state !== "ACTIVE" ||
        latest?.id !== requestId ||
        request.version !== input.expectedVersion ||
        target.replyVersion !== input.revision
      )
        throw new DomainHttpException("RESERVATION_SELECTION_CONFLICT");
      const reply = await m.findOneBy(MerchantReplyRevision, {
        targetId: target.id,
        revision: input.revision,
      });
      const now = new Date();
      if (
        candidateState(target, reply, now) !== "PROPOSED" ||
        !reply?.snapshot.offered
      )
        throw new DomainHttpException("RESERVATION_PROPOSAL_UNAVAILABLE");
      let selection: SelectedReservation | undefined;
      if (action === "SELECT") {
        if (
          await m.existsBy(SelectedReservation, {
            eventId,
            cancelledAt: IsNull(),
          })
        )
          throw new DomainHttpException("RESERVATION_SELECTION_CONFLICT");
        selection = await m.save(SelectedReservation, {
          id: randomUUID(),
          eventId,
          requestId,
          targetId: target.id,
          revision: reply.revision,
          snapshot: reply.snapshot,
          selectedBy: ownerId,
          selectedAt: now,
          version: 1,
          status: "PREPARING",
        });
        target.candidateState = "SELECTED";
        await m.save(target);
        request.state = "SELECTED";
        request.closedAt = now;
        for (const other of targets) {
          if (other.id === target.id || other.candidateState !== "OPEN")
            continue;
          const oldReply = await m.findOneBy(MerchantReplyRevision, {
            targetId: other.id,
            revision: other.replyVersion,
          });
          const state = candidateState(other, oldReply, now);
          await this.close(
            m,
            request,
            other,
            state === "MERCHANT_DECLINED"
              ? "MERCHANT_DECLINED"
              : state === "EXPIRED"
                ? "EXPIRED"
                : "OTHER_SELECTED",
            ownerId,
            null,
            now,
          );
        }
        await this.events.setReservationSchedule(
          eventId,
          reply.snapshot.offered.startsAt,
          true,
          m,
        );
        await this.notices.merchant(
          m,
          request,
          target,
          "STORE_SELECTED",
          selection.id,
        );
        await this.notices.organizer(
          m,
          request,
          target,
          "STORE_SELECTED",
          reply.revision,
          selection.id,
        );
      } else
        await this.close(
          m,
          request,
          target,
          "ORGANIZER_DECLINED",
          ownerId,
          null,
          now,
        );
      request.version++;
      await m.save(request);
      await m.insert(ReservationDecision, {
        requestId,
        requestKey: input.requestKey,
        digest,
        targetId: target.id,
        action,
        actorId: ownerId,
        revision: reply.revision,
        createdAt: now,
      });
    });
    await this.notices.dispatchRequest(requestId);
  }
  private async close(
    m: EntityManager,
    request: ReservationRequest,
    target: RequestTarget,
    state: Exclude<RequestTarget["candidateState"], "OPEN" | "SELECTED">,
    actor: string,
    reason: string | null,
    now: Date,
  ) {
    if (target.candidateState !== "OPEN") return;
    target.candidateState = state;
    target.closedAt = now;
    target.closedBy = actor;
    target.closureReason = reason;
    await m.save(target);
    if (state !== "MERCHANT_DECLINED")
      await this.notices.merchant(
        m,
        request,
        target,
        state === "EXPIRED" ? "PROPOSAL_EXPIRED" : "CANDIDATE_CLOSED",
      );
  }
  async closeForReinquiry(
    ownerId: string,
    previous: ReservationRequest,
    input: CreateReservationRequestInput,
    m: EntityManager,
  ) {
    const { request, targets } = await this.locks.request(previous.id, m);
    if (
      input.previousRequestId !== request.id ||
      input.expectedRequestVersion !== request.version ||
      request.state === "SELECTED" ||
      (await m.existsBy(SelectedReservation, {
        eventId: request.eventId,
        cancelledAt: IsNull(),
      }))
    )
      throw new DomainHttpException("RESERVATION_REINQUIRY_BLOCKED");
    const now = new Date();
    for (const target of targets) {
      const reply = await m.findOneBy(MerchantReplyRevision, {
        targetId: target.id,
        revision: target.replyVersion,
      });
      const state = candidateState(target, reply, now);
      if (!terminalCandidate(state))
        throw new DomainHttpException("RESERVATION_REINQUIRY_BLOCKED");
      if (target.candidateState === "OPEN")
        await this.close(
          m,
          request,
          target,
          state as "MERCHANT_DECLINED" | "EXPIRED",
          ownerId,
          null,
          now,
        );
    }
    request.state = "CLOSED";
    request.closedAt ??= now;
    request.version++;
    await m.save(request);
  }
  async expire(requestId: string) {
    const db = await this.database.connect();
    await db.transaction(async (m) => {
      const { request, targets } = await this.locks.request(requestId, m);
      if (request.state !== "ACTIVE") return;
      const now = new Date();
      let changed = false;
      for (const target of targets) {
        const reply = await m.findOneBy(MerchantReplyRevision, {
          targetId: target.id,
          revision: target.replyVersion,
        });
        if (
          target.candidateState === "OPEN" &&
          candidateState(target, reply, now) === "EXPIRED"
        ) {
          await this.close(m, request, target, "EXPIRED", "SYSTEM", null, now);
          changed = true;
        }
      }
      if (changed) {
        request.version++;
        await m.save(request);
      }
    });
    await this.notices.dispatchRequest(requestId);
  }
  async expirePending() {
    const db = await this.database.connect();
    const rows = await db.manager.find(ReservationRequest, {
      where: { state: "ACTIVE" },
      order: { createdAt: "ASC" },
    });
    for (const r of rows) await this.expire(r.id);
    return { checked: rows.length };
  }
  async closeUnanswered(
    targetId: string,
    actor: string,
    reason: string,
    dryRun: boolean,
  ) {
    if (
      !actor.trim() ||
      actor.length > 100 ||
      !reason.trim() ||
      reason.length > 500
    )
      throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    const result = await db.transaction(async (m) => {
      const { request, target } = await this.locks.target(targetId, m);
      if (target.candidateState === "OPERATOR_CLOSED")
        return { requestId: request.id, targetId, dryRun };
      if (
        request.state !== "ACTIVE" ||
        target.candidateState !== "OPEN" ||
        target.replyVersion !== 0
      )
        throw new DomainHttpException("RESERVATION_PROPOSAL_UNAVAILABLE");
      if (!dryRun) {
        await this.close(
          m,
          request,
          target,
          "OPERATOR_CLOSED",
          actor,
          reason,
          new Date(),
        );
        request.version++;
        await m.save(request);
      }
      return { requestId: request.id, targetId, dryRun };
    });
    if (!dryRun) await this.notices.dispatchRequest(result.requestId);
    return result;
  }
}
