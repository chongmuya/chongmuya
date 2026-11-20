import { EventsService } from "../events/events.service.js";
import { Injectable } from "@nestjs/common";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { LessThan, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { NotificationInput } from "../notifications/types/notification.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationAccessService } from "./reservation-access.service.js";
import { ReservationManagementLink } from "./entities/reservation-progress.entity.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { MerchantLinksService } from "./merchant-links.service.js";
import { MessageGateway } from "./providers/message.gateway.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { AuthService } from "../auth/auth.service.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import {
  ReservationChange,
  ReservationCompletionHistory,
} from "./entities/reservation-progress.entity.js";
import { heldSeats, materiallyChangedReply } from "./lib/inquiry-sms-policy.js";
import { completionSmsPolicy } from "./lib/completion-sms-policy.js";
import { initialPreparation } from "./lib/reservation-completion.js";
import {
  merchantSms,
  RESERVATION_SMS_POLICY_VERSION,
} from "./lib/reservation-sms.js";

type Fact = NonNullable<
  Awaited<ReturnType<NotificationsService["messageFact"]>>
>;

@Injectable()
export class ReservationNotificationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly auth: AuthService,
    private readonly notices: NotificationsService,
    private readonly gateway: MessageGateway,
    private readonly config: ConfigService,
    private readonly restaurants: RestaurantsService,
    private readonly links: MerchantLinksService,
    private readonly management: ReservationAccessService,
  ) {}
  async organizer(
    m: EntityManager,
    request: ReservationRequest,
    target: RequestTarget,
    kind: "REPLY_RECEIVED",
    revision: number,
    sendSms: boolean,
  ) {
    await this.notices.record(
      m,
      this.organizerInput(request, target, kind, revision, undefined, sendSms),
    );
  }
  organizerInput(
    request: ReservationRequest,
    target: RequestTarget,
    kind: "REPLY_RECEIVED" | "STORE_SELECTED",
    revision: number,
    reservationId?: string,
    sendSms = false,
  ): NotificationInput {
    const title =
      kind === "REPLY_RECEIVED"
        ? "매장 답변이 도착했어요"
        : "매장 선택이 완료됐어요";
    const summary =
      kind === "REPLY_RECEIVED"
        ? "문의에서 제안과 선택 기한을 확인해 주세요."
        : "메뉴 전달과 필요한 실제 입금 확인 전에는 예약 확정이 아닙니다.";
    const destination = this.organizerDestination(request);
    return {
      eventKey: `${request.id}:${target.id}:${kind}:${revision}`,
      kind,
      eventId: request.eventId,
      requestId: request.id,
      targetId: target.id,
      reservationId,
      revision,
      smsPolicyVersion: RESERVATION_SMS_POLICY_VERSION,
      accounts: request.currentContactAccountId
        ? [{ id: request.currentContactAccountId, title, summary, destination }]
        : [],
      messages: sendSms
        ? [
            this.organizerMessage(
              request,
              target,
              revision === 1 ? "매장 답변 확인" : "매장 답변 변경. 조건 확인",
            ),
          ]
        : [],
    };
  }

  organizerMessage(
    request: ReservationRequest,
    target: RequestTarget,
    text: string,
  ) {
    return {
      recipientKey: `organizer:${request.currentContactAccountId ?? request.id}`,
      phone: request.currentContactPhone ?? request.contactPhone,
      isDemo: target.isDemo,
      text: `[총무야] ${target.restaurantName} ${text}`.normalize("NFC"),
    };
  }

  private organizerDestination(request: ReservationRequest) {
    return `/events?event=${request.eventId}&request=${request.id}`;
  }

  async merchantInput(
    m: EntityManager,
    request: ReservationRequest,
    target: RequestTarget,
    kind: "STORE_SELECTED" | "CANDIDATE_CLOSED" | "PROPOSAL_EXPIRED",
    reservationId?: string,
    releaseSeats = false,
  ): Promise<NotificationInput> {
    const { link } =
      reservationId || !releaseSeats
        ? { link: null }
        : await this.links.context(target.id, m);
    const managementLink = reservationId
      ? await m.findOneBy(ReservationManagementLink, { reservationId })
      : null;
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
    const destination = reservationId
      ? `/owner/reservations?reservation=${reservationId}`
      : `/owner/inquiries?target=${target.id}`;
    const input: NotificationInput = {
      eventKey: `${request.id}:${target.id}:${kind}`,
      kind,
      eventId: request.eventId,
      requestId: request.id,
      targetId: target.id,
      reservationId,
      revision: target.replyVersion,
      accounts: owner ? [{ id: owner, title, summary, destination }] : [],
      smsPolicyVersion: RESERVATION_SMS_POLICY_VERSION,
      messages: [],
    };
    const recipient = managementLink ?? link;
    if (recipient && !recipient.revokedAt && recipient.expiresAt > new Date()) {
      const reply = await m.findOneBy(MerchantReplyRevision, {
        targetId: target.id,
        revision: target.replyVersion,
      });
      try {
        input.messages.push({
          recipientKey: managementLink
            ? `reservation:${reservationId}:${managementLink.generation}`
            : `merchant:${target.id}:${recipient.generation}`,
          phone: recipient.phoneSnapshot,
          contactId: recipient.contactId,
          isDemo: target.isDemo,
          text: merchantSms(
            request.snapshot.eventName,
            reply?.snapshot.offered ?? request.snapshot,
            managementLink
              ? "매장 선택 완료(확정 전). 예약 관리에서 준비 사항을 확인해 주세요."
              : "예약 후보 종료. 좌석 유지를 해제하고 종료 사유를 확인해 주세요.",
            managementLink
              ? this.management.url(managementLink)
              : this.links.url(link!),
          ),
        });
      } catch (error) {
        if (
          !(error instanceof DomainHttpException) ||
          error.code !== "MESSAGE_CONFIGURATION"
        )
          throw error;
        input.merchantHold = { reason: "LINK_INVALID" };
      }
    }
    return input;
  }
  recordBatch(m: EntityManager, inputs: NotificationInput[]) {
    return this.notices.recordBatch(m, inputs);
  }
  async dispatchRequest(requestId: string) {
    const db = await this.database.connect();
    const rows = await this.notices.messages(requestId, db.manager);
    await Promise.allSettled(rows.map((r) => this.dispatch(r.id)));
  }
  private async legacyAction(fact: Fact, organizer: boolean, m: EntityManager) {
    const targetId = fact.targetId;
    const revision = fact.revision;
    if (fact.kind === "REPLY_RECEIVED" && organizer && targetId) {
      const reply = await m.findOneBy(MerchantReplyRevision, {
        targetId,
        revision,
      });
      const previous =
        revision > 1
          ? await m.findOneBy(MerchantReplyRevision, {
              targetId,
              revision: revision - 1,
            })
          : null;
      return reply &&
        (revision === 1 || previous) &&
        materiallyChangedReply(previous, reply)
        ? {
            text:
              revision === 1 ? "매장 답변 확인" : "매장 답변 변경. 조건 확인",
          }
        : null;
    }
    if (fact.kind === "STORE_SELECTED" || fact.kind === "CANDIDATE_CLOSED") {
      if (organizer || !targetId) return null;
      const reply = await m.findOneBy(MerchantReplyRevision, {
        targetId,
        revision,
      });
      if (!reply?.snapshot.offered) return null;
      if (fact.kind === "STORE_SELECTED")
        return {
          text: "매장 선택 완료(확정 전). 예약 관리에서 준비 사항을 확인해 주세요.",
          terms: reply.snapshot.offered,
        };
      const target = await m.findOneBy(RequestTarget, { id: targetId });
      return target?.closedAt &&
        ["OTHER_SELECTED", "ORGANIZER_DECLINED"].includes(
          target.candidateState,
        ) &&
        heldSeats(reply, target.closedAt)
        ? {
            text: "예약 후보 종료. 좌석 유지를 해제하고 종료 사유를 확인해 주세요.",
            terms: reply.snapshot.offered,
          }
        : null;
    }
    const reservationId = fact.reservationId;
    if (!reservationId || fact.kind !== "RESERVATION_UPDATED") return null;
    const kind = fact.eventKey.split(":")[1];
    const history = await m.findOneBy(ReservationCompletionHistory, {
      reservationId,
      version: revision,
    });
    if (!history) return null;
    if (kind === "MANAGEMENT_LINK" && history.action === kind && !organizer)
      return {
        text: "새 예약 관리 링크로 메뉴·입금·변경취소를 확인해 주세요.",
        terms: history.snapshot.agreement,
      };
    const previous = await m.findOne(ReservationCompletionHistory, {
      where: { reservationId, version: LessThan(revision) },
      order: { version: "DESC" },
    });
    const selection = previous
      ? null
      : await m.findOneBy(SelectedReservation, { id: reservationId });
    const before =
      previous?.snapshot ?? (selection ? initialPreparation(selection) : null);
    if (!before) return null;
    const command = history.evidence.command as
      { changeId?: string; kind?: "CHANGE" | "CANCEL" } | undefined;
    const change =
      history.action.startsWith("CHANGE_") && command?.changeId
        ? await m.findOneBy(ReservationChange, {
            id: command.changeId,
            reservationId,
          })
        : null;
    const confirmed = !!(await this.notices.messageFact(
      `${reservationId}:CONFIRMED:${revision}`,
      m,
    ));
    const policy = completionSmsPolicy({
      action: history.action,
      before,
      after: history.snapshot,
      changeKind:
        change?.kind ??
        (history.action === "CHANGE_REQUESTED" ? command?.kind : undefined),
      proposedGuidance: change?.proposal?.guidance,
      operator: history.audit.kind === "OPERATOR_RECORDED",
      confirmed,
    });
    const sms = organizer ? policy.organizer : policy.merchant;
    return sms?.kind === kind
      ? { text: sms.text, terms: history.snapshot.agreement }
      : null;
  }

  async mayReplanOrganizer(fact: Fact, m: EntityManager) {
    return (
      fact.smsPolicyVersion === RESERVATION_SMS_POLICY_VERSION ||
      !!(await this.legacyAction(fact, true, m))
    );
  }

  async dispatch(id: string, retry?: { actor: string; reason: string }) {
    const row = await this.notices.claim(
      id,
      this.gateway.requiresRealRecipient,
      retry,
    );
    if (!row) return;
    const db = await this.database.connect();
    const fact = await this.notices.messageFact(row.eventKey, db.manager);
    const request = fact
      ? await db.manager.findOneBy(ReservationRequest, { id: fact.requestId })
      : null;
    const target = fact?.targetId
      ? await db.manager.findOneBy(RequestTarget, { id: fact.targetId })
      : null;
    const organizer = row.recipientKey.startsWith("organizer:");
    const legacy =
      fact && fact.smsPolicyVersion !== RESERVATION_SMS_POLICY_VERSION;
    const action = legacy
      ? await this.legacyAction(fact, organizer, db.manager)
      : null;
    if (!fact || !request || !target || (legacy && !action)) {
      await this.notices.hold(row.id, "SMS_POLICY_SUPPRESSED");
      return;
    }
    let text = row.text;
    if (organizer) {
      const recipient = await db.transaction(async (m) => {
        await this.events.lockReservationEvent(request.eventId, m);
        const current = await m.findOneOrFail(ReservationRequest, {
          where: { id: request.id },
          lock: { mode: "pessimistic_write" },
        });
        const account = current.currentContactAccountId;
        const recipient = account ?? current.id;
        const phone = current.currentContactPhone ?? current.contactPhone;
        if (
          row.recipientKey.split(":")[1] !== recipient ||
          row.phoneSnapshot !== phone
        ) {
          await this.notices.replanUnsubmitted(
            row.id,
            row.attempts,
            current.id,
            { id: recipient, phone },
            m,
            (fact) => this.mayReplanOrganizer(fact, m),
          );
          return null;
        }
        const inbox =
          account &&
          (await this.auth.canUseOrganizerWorkspace(account, m)) &&
          (await this.notices.hasInboxItem(fact.eventKey, account, m));
        return inbox ? "/notifications" : this.organizerDestination(current);
      });
      if (!recipient) {
        await this.dispatchRequest(request.id);
        return;
      }
      text = `${action ? this.organizerMessage(request, target, action.text).text : text}
${this.config.environment.webOrigin}${recipient}`;
    } else {
      let url: (() => string) | undefined;
      if (row.recipientKey.startsWith("reservation:")) {
        const [, id, generation] = row.recipientKey.split(":");
        const link = await db.manager.findOneBy(ReservationManagementLink, {
          reservationId: id,
        });
        if (
          !link ||
          fact.reservationId !== id ||
          target.candidateState !== "SELECTED" ||
          link.revokedAt ||
          link.expiresAt <= new Date() ||
          String(link.generation) !== generation ||
          link.contactId !== row.contactIdSnapshot ||
          link.phoneSnapshot !== row.phoneSnapshot
        ) {
          await this.notices.hold(row.id, "LINK_INVALID");
          return;
        }
        url = () => this.management.url(link);
      } else {
        const { link } = await this.links.context(target.id, db.manager);
        if (
          !link ||
          row.recipientKey !==
            (legacy
              ? `merchant:${target.id}`
              : `merchant:${target.id}:${link.generation}`) ||
          link.revokedAt ||
          link.expiresAt <= new Date() ||
          link.contactId !== row.contactIdSnapshot ||
          link.phoneSnapshot !== row.phoneSnapshot
        ) {
          await this.notices.hold(row.id, "LINK_INVALID");
          return;
        }
        url = () => this.links.url(link);
      }
      const [reasons] = await this.restaurants.deliveryEligibility(
        [
          {
            contactId: row.contactIdSnapshot!,
            restaurantId: target.restaurantId,
            contactPhone: row.phoneSnapshot,
          },
        ],
        db.manager,
        this.gateway.requiresRealRecipient,
      );
      if (reasons?.length) {
        await this.notices.hold(row.id, reasons[0]!);
        return;
      }
      if (action) {
        try {
          text = merchantSms(
            request.snapshot.eventName,
            action.terms ?? request.snapshot,
            action.text,
            url(),
          );
        } catch (error) {
          if (
            !(error instanceof DomainHttpException) ||
            error.code !== "MESSAGE_CONFIGURATION"
          )
            throw error;
          await this.notices.hold(row.id, "LINK_INVALID");
          return;
        }
      }
    }
    const result = await this.gateway.send(
      row.id,
      row.phoneSnapshot,
      text,
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
