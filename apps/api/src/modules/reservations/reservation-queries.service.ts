import { Injectable, NotFoundException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { EventsService } from "../events/events.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import { MessageDelivery } from "./entities/message-delivery.entity.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { candidateState, terminalCandidate } from "./lib/candidate-state.js";
import { replyView } from "./lib/reply-view.js";
import type { ReservationRequestDto } from "./dto/response/reservation-request.response.dto.js";
@Injectable()
export class ReservationQueriesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}
  async get(
    ownerId: string,
    eventId: string,
    requestId?: string,
  ): Promise<ReservationRequestDto | null> {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      await this.events.assertOwned(ownerId, eventId, m);
      const row = await m.findOne(ReservationRequest, {
        where: { eventId, ...(requestId ? { id: requestId } : {}) },
        order: { round: "DESC" },
      });
      if (requestId && !row) throw new NotFoundException();
      return row ? this.dto(row, m) : null;
    });
  }
  async dto(
    row: ReservationRequest,
    manager: EntityManager,
  ): Promise<ReservationRequestDto> {
    const now = new Date();
    const selection = await manager.findOneBy(SelectedReservation, {
      requestId: row.id,
    });
    const current = await manager.findOne(ReservationRequest, {
      where: { eventId: row.eventId },
      order: { round: "DESC" },
    });
    const targets = await manager
      .getRepository(RequestTarget)
      .find({ where: { requestId: row.id }, order: { restaurantId: "ASC" } });
    const enriched = await Promise.all(
      targets.map(async (t) => {
        const revision = await manager.findOneBy(MerchantReplyRevision, {
          targetId: t.id,
          revision: t.replyVersion,
        });
        const response = replyView(revision);
        const state = candidateState(t, revision, now);
        const delivery = await manager.findOne(MessageDelivery, {
          where: { targetId: t.id },
          order: { createdAt: "DESC" },
        });
        return {
          id: t.id,
          candidateState: state,
          closedAt: t.closedAt?.toISOString() ?? null,
          canSelect:
            row.state === "ACTIVE" &&
            current?.id === row.id &&
            state === "PROPOSED",
          restaurantId: t.restaurantId,
          restaurantName: t.restaurantName,
          photoPath: t.photoPath,
          address: t.address,
          isDemo: t.isDemo,
          deliveryStatus: t.deliveryStatus,
          delivery: delivery
            ? {
                provider: delivery.provider,
                failureStage: delivery.failureStage,
                errorCode: delivery.errorCode,
                updatedAt: delivery.updatedAt.toISOString(),
              }
            : null,
          response,
        };
      }),
    );
    return {
      id: row.id,
      eventId: row.eventId,
      createdAt: row.createdAt.toISOString(),
      status: "RECEIVED",
      round: row.round,
      version: row.version,
      lifecycle: row.state,
      isCurrent: current?.id === row.id,
      canReinquire:
        current?.id === row.id &&
        !selection &&
        enriched.every((t) => terminalCandidate(t.candidateState)),
      reinquiryBlockedReason: selection
        ? "STORE_SELECTED"
        : enriched.some((t) => t.candidateState === "AWAITING_REPLY")
          ? "AWAITING_REPLY"
          : enriched.some((t) => t.candidateState === "PROPOSED")
            ? "VALID_PROPOSAL"
            : null,
      history: (
        await manager.find(ReservationRequest, {
          where: { eventId: row.eventId },
          order: { round: "DESC" },
        })
      ).map((r) => ({ id: r.id, round: r.round, state: r.state })),
      selection: selection
        ? {
            id: selection.id,
            targetId: selection.targetId,
            revision: selection.revision,
            version: selection.version,
            status: selection.status,
            snapshot: selection.snapshot,
            selectedAt: selection.selectedAt.toISOString(),
          }
        : null,
      notifications: (await this.notifications.messages(row.id, manager)).map(
        (n) => ({
          id: n.id,
          recipientKind: n.recipientKey.startsWith("organizer:")
            ? ("ORGANIZER" as const)
            : ("MERCHANT" as const),
          status: n.status,
          provider: n.provider,
          errorCode: n.errorCode,
          updatedAt: n.updatedAt.toISOString(),
        }),
      ),
      currentContact: {
        accountId: row.currentContactAccountId,
        name: row.currentContactName ?? row.contactName,
        maskedPhone: `${(row.currentContactPhone ?? row.contactPhone).slice(0, 3)}-****-${(row.currentContactPhone ?? row.contactPhone).slice(-4)}`,
      },
      responseCount: enriched.filter((t) => t.response).length,
      proposalCount: enriched.filter(
        (t) => t.response && t.response.kind !== "DECLINE",
      ).length,
      declineCount: enriched.filter((t) => t.response?.kind === "DECLINE")
        .length,
      snapshot: row.snapshot,
      contact: {
        name: row.contactName,
        maskedPhone: `${row.contactPhone.slice(0, 3)}-****-${row.contactPhone.slice(-4)}`,
        phoneVerifiedAt: row.contactPhoneVerifiedAt?.toISOString() ?? null,
      },
      targets: enriched,
    };
  }
}
