import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { MerchantLinksService } from "./merchant-links.service.js";
import { MessageGateway } from "./providers/message.gateway.js";
import type { ReservationRequest } from "./entities/reservation-request.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
@Injectable()
export class ReservationNotificationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notices: NotificationsService,
    private readonly gateway: MessageGateway,
    private readonly config: ConfigService,
    private readonly restaurants: RestaurantsService,
    private readonly links: MerchantLinksService,
  ) {}
  async organizer(
    m: EntityManager,
    request: ReservationRequest,
    target: RequestTarget,
    kind: "REPLY_RECEIVED" | "STORE_SELECTED",
    revision: number,
    reservationId?: string,
  ) {
    const title =
      kind === "REPLY_RECEIVED"
        ? "매장 답변이 도착했어요"
        : "매장 선택이 완료됐어요";
    const summary =
      kind === "REPLY_RECEIVED"
        ? "문의에서 제안과 선택 기한을 확인해 주세요."
        : "메뉴 전달과 필요한 실제 입금 확인 전에는 예약 확정이 아닙니다.";
    const destination = `/events?event=${request.eventId}`;
    await this.notices.record(m, {
      eventKey: `${request.id}:${target.id}:${kind}:${revision}`,
      kind,
      eventId: request.eventId,
      requestId: request.id,
      targetId: target.id,
      reservationId,
      revision,
      accounts: request.currentContactAccountId
        ? [{ id: request.currentContactAccountId, title, summary, destination }]
        : [],
      messages: [
        {
          recipientKey: `organizer:${request.currentContactAccountId ?? request.id}`,
          phone: request.currentContactPhone ?? request.contactPhone,
          isDemo: target.isDemo,
          text: `[총무야] ${title}\n${summary}\n${this.config.environment.webOrigin}${destination}`,
        },
      ],
    });
  }
  async merchant(
    m: EntityManager,
    request: ReservationRequest,
    target: RequestTarget,
    kind: "STORE_SELECTED" | "CANDIDATE_CLOSED" | "PROPOSAL_EXPIRED",
    reservationId?: string,
  ) {
    const { link } = await this.links.context(target.id, m);
    const owner = await this.restaurants.notificationAccount(
      target.restaurantId,
      m,
    );
    const title =
      kind === "STORE_SELECTED"
        ? "총무가 매장을 선택했어요"
        : "예약 문의가 종료됐어요";
    const summary =
      kind === "STORE_SELECTED"
        ? "메뉴 전달과 필요한 실제 입금 확인을 준비해 주세요. 아직 예약 확정은 아닙니다."
        : kind === "PROPOSAL_EXPIRED"
          ? "총무의 선택 기한이 지났어요."
          : "이 문의의 후보 선정이 종료됐어요.";
    const destination = `/owner/inquiries?target=${target.id}`;
    await this.notices.record(m, {
      eventKey: `${request.id}:${target.id}:${kind}`,
      kind,
      eventId: request.eventId,
      requestId: request.id,
      targetId: target.id,
      reservationId,
      revision: target.replyVersion,
      accounts: owner ? [{ id: owner, title, summary, destination }] : [],
      messages: link
        ? [
            {
              recipientKey: `merchant:${target.id}`,
              phone: link.phoneSnapshot,
              contactId: link.contactId,
              isDemo: target.isDemo,
              text: `[총무야] ${request.snapshot.eventName} · ${target.restaurantName}\n${title}\n${summary}`,
            },
          ]
        : [],
    });
  }
  async dispatchRequest(requestId: string) {
    const db = await this.database.connect();
    const rows = await this.notices.messages(requestId, db.manager);
    await Promise.allSettled(rows.map((r) => this.dispatch(r.id)));
  }
  async dispatch(id: string, retry?: { actor: string; reason: string }) {
    const row = await this.notices.claim(
      id,
      this.gateway.requiresRealRecipient,
      retry,
    );
    if (!row) return;
    if (row.recipientKey.startsWith("merchant:")) {
      const db = await this.database.connect();
      const target = await db.manager.findOneBy(RequestTarget, {
        id: row.recipientKey.slice(9),
      });
      const reasons =
        target && row.contactIdSnapshot
          ? (
              await this.restaurants.deliveryEligibility(
                [
                  {
                    contactId: row.contactIdSnapshot,
                    restaurantId: target.restaurantId,
                    contactPhone: row.phoneSnapshot,
                  },
                ],
                db.manager,
                this.gateway.requiresRealRecipient,
              )
            )[0]
          : ["CONTACT_DELETED"];
      if (reasons?.length) {
        await this.notices.hold(row.id, reasons[0]!);
        return;
      }
    }
    const result = await this.gateway.send(
      row.id,
      row.phoneSnapshot,
      row.text,
      row.attempts,
    );
    await this.notices.settle(row.id, result, row.attempts);
  }
  async dispatchPending() {
    for (const row of await this.notices.pending()) await this.dispatch(row.id);
  }
  async reconcile(id: string, actor: string, reason: string) {
    const row = await this.notices.recover(id, actor, reason);
    if (["PROCESSING", "PENDING", "HELD"].includes(row.status))
      return { id, status: row.status };
    for (const report of await this.gateway.lookup({
      deliveryId: id,
      messageId: row.providerMessageId,
      groupId: row.providerGroupId,
      to: row.phoneSnapshot,
      startedAt: row.startedAt ?? row.updatedAt,
    }))
      await this.notices.report(report);
    return { id, reconciled: true };
  }
}
