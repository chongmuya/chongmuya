import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { EventsService } from "../events/events.service.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { NotificationInput } from "../notifications/types/notification.js";
import { ReservationLocksService } from "./reservation-locks.service.js";
import { ReservationAccessService } from "./reservation-access.service.js";
import { ReservationNotificationsService } from "./reservation-notifications.service.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import {
  ReservationProgress,
  ReservationCompletionHistory,
  ReservationChange,
  ReservationManagementLink,
} from "./entities/reservation-progress.entity.js";
import { commandSchema } from "./types/reservation-completion.js";
import type {
  ReservationPrincipal,
  ReservationReadPrincipal,
  ReservationPreparation,
  ReservationAudit,
  RefundFact,
} from "./types/reservation-completion.js";
import {
  initialPreparation,
  completionStatus,
  completionIssues,
  advanceConfirmation,
} from "./lib/reservation-completion.js";
export type CompletionContext = {
  m: EntityManager;
  selection: SelectedReservation;
  request: ReservationRequest;
  target: RequestTarget;
  state: ReservationPreparation;
  audit: ReservationAudit;
  notifications: NotificationInput[];
  evidence?: Record<string, unknown>;
};
@Injectable()
export class ReservationCompletionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly restaurants: RestaurantsService,
    private readonly locks: ReservationLocksService,
    private readonly access: ReservationAccessService,
    private readonly notices: NotificationsService,
    private readonly sender: ReservationNotificationsService,
    private readonly config: ConfigService,
  ) {}
  audit(p: ReservationPrincipal): ReservationAudit {
    const now = new Date().toISOString();
    if (p.kind === "operator") {
      if (
        !p.actor?.trim() ||
        !p.confirmer?.trim() ||
        !p.reason?.trim() ||
        !["PHONE", "SMS"].includes(p.method) ||
        !Number.isFinite(Date.parse(p.confirmedAt)) ||
        Date.parse(p.confirmedAt) > Date.now()
      )
        throw new DomainHttpException("VALIDATION_FAILED");
      return {
        kind: "OPERATOR_RECORDED",
        recorder: p.actor,
        confirmer: p.confirmer,
        method: p.method,
        confirmedAt: p.confirmedAt,
        recordedAt: now,
        reason: p.reason,
      };
    }
    return {
      kind: p.kind.toUpperCase(),
      recorder: p.kind === "link" ? "RESERVATION_LINK" : p.user.id,
      confirmer: p.kind === "link" ? "매장 예약관리 링크" : p.user.id,
      method: "WEB",
      confirmedAt: now,
      recordedAt: now,
      reason: "직접 기록",
    };
  }
  async context(
    id: string,
    p: ReservationPrincipal,
    m: EntityManager,
    write = false,
  ): Promise<CompletionContext> {
    const context = await this.readContext(id, p, m, write);
    return { ...context, audit: this.audit(p), notifications: [] };
  }
  private async readContext(
    id: string,
    p: ReservationReadPrincipal,
    m: EntityManager,
    write = false,
  ): Promise<Omit<CompletionContext, "audit" | "notifications">> {
    let selection = await m.findOneBy(SelectedReservation, { id });
    if (!selection) throw new NotFoundException();
    if (write) {
      await this.locks.request(selection.requestId, m);
      selection = await m.findOneOrFail(SelectedReservation, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
    }
    const target = await m.findOneByOrFail(RequestTarget, {
        id: selection.targetId,
      }),
      request = await m.findOneByOrFail(ReservationRequest, {
        id: selection.requestId,
      });
    if (p.kind === "organizer")
      await this.events.assertOwned(p.user.id, selection.eventId, m);
    else if (p.kind === "owner") {
      if (p.user.accountType !== "owner")
        throw new DomainHttpException("OWNER_REQUIRED");
      await this.restaurants.assertOwned(p.user.id, target.restaurantId, m);
    } else if (p.kind === "link") await this.access.authorize(id, p.access, m);
    const stored = await m.findOneBy(ReservationProgress, {
      reservationId: id,
    });
    return {
      m,
      selection,
      target,
      request,
      state: stored?.state ?? initialPreparation(selection),
    };
  }
  async get(id: string, p: ReservationReadPrincipal) {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) =>
      this.view(await this.readContext(id, p, m), p),
    );
  }
  async list(p: ReservationPrincipal) {
    if (p.kind !== "owner") throw new DomainHttpException("OWNER_REQUIRED");
    const db = await this.database.connect();
    const ids = await this.restaurants.ownedIds(p.user.id, db.manager);
    if (!ids.length) return [];
    const targets = await db.manager.find(RequestTarget, {
      where: { restaurantId: In(ids), candidateState: "SELECTED" },
    });
    if (!targets.length) return [];
    const selections = await db.manager.find(SelectedReservation, {
      where: { targetId: In(targets.map((t) => t.id)) },
      order: { selectedAt: "DESC" },
      take: 100,
    });
    return Promise.all(selections.map((s) => this.get(s.id, p)));
  }
  async view(
    c: Omit<CompletionContext, "audit" | "notifications">,
    p: ReservationReadPrincipal,
  ) {
    const { m, selection: r, state: s, target, request } = c;
    const organizer = p.kind === "organizer";
    const safeGuidance = (source: ReservationPreparation["guidance"]) => {
      const result = structuredClone(source);
      if (organizer && result.channel !== "WEB") {
        result.bank = "";
        result.account = "";
        result.holder = "";
      }
      return result;
    };
    const guidance = safeGuidance(s.guidance);
    const changes = await m.find(ReservationChange, {
      where: { reservationId: r.id },
      order: { createdAt: "DESC" },
    });
    const safeChanges = changes.map((c) => {
      const copy = structuredClone(c);
      if (
        organizer &&
        copy.proposal?.guidance.channel !== "WEB" &&
        copy.proposal
      ) {
        copy.proposal.guidance.bank = "";
        copy.proposal.guidance.account = "";
        copy.proposal.guidance.holder = "";
      }
      return copy;
    });
    const history = await m.find(ReservationCompletionHistory, {
      where: { reservationId: r.id },
      order: { version: "DESC" },
    });
    const now = Date.now();
    return {
      id: r.id,
      eventId: r.eventId,
      targetId: r.targetId,
      restaurantId: target.restaurantId,
      restaurantName: target.restaurantName,
      eventName: request.snapshot.eventName,
      currentContact: {
        name: request.currentContactName ?? request.contactName,
        maskedPhone: `${(request.currentContactPhone ?? request.contactPhone).slice(0, 3)}-****-${(request.currentContactPhone ?? request.contactPhone).slice(-4)}`,
        changedAt: request.contactChanges.at(-1)?.at ?? null,
      },
      version: r.version,
      status: r.status,
      progress: completionStatus(s, now),
      issues: completionIssues(s, now),
      selectionSnapshot: r.snapshot,
      agreement: s.agreement,
      agreementRevision: s.agreementRevision,
      guidance,
      draft: s.draft,
      order: s.order,
      acknowledgedRevision: s.acknowledgedRevision,
      transfer: s.transfer,
      receipt: s.receipt,
      receivedAmount: s.receipt?.amount ?? 0,
      refundedAmount: s.refunded,
      refundExpected: s.refundExpected,
      cancellation: s.cancellation,
      confirmation: s.confirmation
        ? {
            at: s.confirmation.at,
            audit: s.confirmation.audit,
            agreement: s.confirmation.agreement,
            guidance: safeGuidance(s.confirmation.guidance),
            order: s.confirmation.order,
            receivedAmount: s.confirmation.receivedAmount,
          }
        : null,
      changes: safeChanges,
      history: history.map((h) => ({
        version: h.version,
        action: h.action,
        audit: h.audit,
        order: h.snapshot.order,
        agreement: h.snapshot.agreement,
        guidance: safeGuidance(h.snapshot.guidance),
        transfer: h.snapshot.transfer,
        receipt: h.snapshot.receipt,
        receivedAmount: h.snapshot.receipt?.amount ?? 0,
        refundedAmount: h.snapshot.refunded,
        refund: h.evidence.refund as RefundFact | undefined,
      })),
      catalog: await this.restaurants.reservationMenu(target.restaurantId, m),
      notifications: (await this.notices.messages(request.id, m))
        .filter((n) => n.eventKey.startsWith(`${r.id}:`))
        .map((n) => ({
          id: n.id,
          status: n.status,
          failureStage: n.failureStage,
          errorCode: n.errorCode,
        })),
    };
  }
  async write<T extends { requestKey: string; expectedVersion: number }>(
    id: string,
    p: ReservationPrincipal,
    action: string,
    schema: z.ZodType<T>,
    raw: unknown,
    role: "organizer" | "merchant" | "operator",
    mutate: (c: CompletionContext, input: T) => Promise<void>,
    dryRun = false,
  ) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fields = [
        "amount",
        "deadline",
        "bank",
        "account",
        "holder",
        "policy",
        "payer",
        "receivedAt",
        "refundedAt",
        "reason",
        "kind",
        "subject",
      ];
      throw new DomainHttpException(
        "VALIDATION_FAILED",
        parsed.error.issues
          .flatMap((issue) =>
            fields.includes(String(issue.path[0]))
              ? [
                  {
                    field: String(issue.path[0]),
                    code: "INVALID_VALUE" as const,
                  },
                ]
              : [],
          )
          .slice(0, 50),
      );
    }
    if (
      (role === "organizer" && p.kind !== "organizer") ||
      (role === "merchant" && p.kind === "organizer") ||
      (role === "operator" && p.kind !== "operator")
    )
      throw new DomainHttpException("RESERVATION_ACCESS_INVALID");
    const db = await this.database.connect(),
      input = parsed.data;
    let requestId = "";
    const rollbackPreview = Symbol("validated preview");
    await db
      .transaction(async (m) => {
        const c = await this.context(id, p, m, true);
        requestId = c.request.id;
        const actor =
          p.kind === "link"
            ? "link"
            : p.kind === "operator"
              ? p.actor
              : p.user.id;
        const digest = createHash("sha256")
          .update(JSON.stringify({ action, actor, input }))
          .digest("hex");
        const existing = await m.findOneBy(ReservationCompletionHistory, {
          reservationId: id,
          requestKey: input.requestKey,
        });
        if (existing) {
          if (existing.digest !== digest)
            throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
          return;
        }
        if (c.selection.version !== input.expectedVersion)
          throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
        await mutate(c, input);
        const confirmed = advanceConfirmation(c.selection, c.state, c.audit);
        if (confirmed)
          await this.notify(
            c,
            "CONFIRMED",
            "예약이 확정됐어요. 메뉴와 필요한 실제 입금 확인이 완료됐어요.",
            "both",
          );
        if (dryRun) throw rollbackPreview;
        await this.notices.recordBatch(m, c.notifications);
        c.selection.version++;
        await m.save(c.selection);
        await m.save(ReservationProgress, {
          reservationId: id,
          state: c.state,
        });
        await m.insert(ReservationCompletionHistory, {
          id: randomUUID(),
          reservationId: id,
          requestKey: input.requestKey,
          digest,
          action,
          version: c.selection.version,
          audit: c.audit,
          snapshot: c.state,
          evidence: { command: input, ...c.evidence },
        });
      })
      .catch((error: unknown) => {
        if (error !== rollbackPreview) throw error;
      });
    if (!dryRun)
      await this.sender.dispatchRequest(requestId).catch(() => undefined);
    return this.get(id, p);
  }
  active(c: CompletionContext) {
    if (c.state.cancellation)
      throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
  }
  async manageLink(
    id: string,
    p: ReservationPrincipal,
    raw: unknown,
    dryRun = false,
  ) {
    return this.write(
      id,
      p,
      "MANAGEMENT_LINK",
      commandSchema
        .extend({
          operation: z.enum(["ISSUE", "REVOKE"]),
          contactId: z.uuid().optional(),
          heldEventKey: z.string().min(1).max(200).optional(),
          heldMessageId: z.uuid().optional(),
        })
        .strict()
        .refine(
          (input) =>
            input.operation === "ISSUE" ||
            (!input.contactId && !input.heldEventKey && !input.heldMessageId),
        ),
      raw,
      "operator",
      async (c, input) => {
        const old = await c.m.findOneBy(ReservationManagementLink, {
          reservationId: id,
        });
        c.evidence = {
          previousLink: old
            ? {
                contactId: old.contactId,
                phone: old.phoneSnapshot,
                generation: old.generation,
                expiresAt: old.expiresAt,
                revokedAt: old.revokedAt,
                audit: old.audit,
              }
            : null,
        };
        if (input.operation === "REVOKE") {
          if (old) {
            old.revokedAt = new Date();
            old.audit = c.audit;
            await c.m.save(old);
          }
          return;
        }
        const messages = await this.notices.messages(c.request.id, c.m, true);
        if (
          messages.some(
            (n) =>
              n.recipientKey.startsWith(`reservation:${id}:`) &&
              ["UNKNOWN", "PROCESSING"].includes(n.status),
          )
        )
          throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
        const issued = await this.access.issue(
          c.selection,
          c.target,
          c.m,
          c.audit,
          input.contactId,
        );
        c.evidence.currentLink = {
          contactId: issued.contactId,
          phone: issued.phoneSnapshot,
          generation: issued.generation,
          expiresAt: issued.expiresAt,
          audit: issued.audit,
        };
        const replacementEventKey = await this.notify(
          c,
          "MANAGEMENT_LINK",
          "이 예약의 메뉴·입금·변경취소를 확인할 새 예약 관리 링크입니다.",
          "merchant",
        );
        if (c.notifications.at(-1)?.merchantHold)
          throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
        if (input.heldMessageId)
          await this.notices.replaceHeldMessage(
            input.heldMessageId,
            id,
            replacementEventKey,
            c.audit.recorder,
            c.audit.reason,
            c.m,
          );
        if (input.heldEventKey)
          await this.notices.replaceHeldIntent(
            input.heldEventKey,
            id,
            replacementEventKey,
            c.m,
          );
      },
      dryRun,
    );
  }
  async notify(
    c: CompletionContext,
    kind: string,
    summary: string,
    recipient: "organizer" | "merchant" | "both",
    smsDetails = "",
  ) {
    const { selection: r, request, target, m } = c;
    const eventKey = `${r.id}:${kind}:${r.version + 1}`;
    let merchantHold: NotificationInput["merchantHold"];
    const accounts: {
        id: string;
        title: string;
        summary: string;
        destination: string;
      }[] = [],
      messages: {
        recipientKey: string;
        phone: string;
        contactId?: string;
        text: string;
        isDemo: boolean;
      }[] = [];
    if (recipient !== "merchant") {
      const destination = `/events?event=${r.eventId}`;
      if (request.currentContactAccountId)
        accounts.push({
          id: request.currentContactAccountId,
          title: "예약 진행 안내",
          summary,
          destination,
        });
      messages.push({
        recipientKey: `organizer:${request.currentContactAccountId ?? request.id}`,
        phone: request.currentContactPhone ?? request.contactPhone,
        isDemo: target.isDemo,
        text: `[총무야] ${request.snapshot.eventName}\n${summary}\n${smsDetails}\n${this.config.environment.webOrigin}${destination}`,
      });
    }
    if (recipient !== "organizer") {
      const owner = await this.restaurants.notificationAccount(
        target.restaurantId,
        m,
      );
      if (owner)
        accounts.push({
          id: owner,
          title: "예약 진행 안내",
          summary,
          destination: `/owner/reservations?reservation=${r.id}`,
        });
      const prior = await this.notices.messages(request.id, m, true);
      const result = await this.access.forNotification(
        r,
        target,
        m,
        c.audit,
        prior.some(
          (n) =>
            n.recipientKey.startsWith(`reservation:${r.id}:`) &&
            ["UNKNOWN", "PROCESSING"].includes(n.status),
        ),
      );
      const link = result.link;
      if (!link) merchantHold = { reason: result.reason };
      else
        messages.push({
          recipientKey: `reservation:${r.id}:${link.generation}`,
          phone: link.phoneSnapshot,
          contactId: link.contactId,
          isDemo: target.isDemo,
          text: `[총무야] ${request.snapshot.eventName} · ${target.restaurantName}\n${summary}\n${this.access.url(link)}`,
        });
    }
    c.notifications.push({
      eventKey,
      kind: "RESERVATION_UPDATED",
      eventId: r.eventId,
      requestId: r.requestId,
      targetId: r.targetId,
      reservationId: r.id,
      revision: r.version + 1,
      accounts,
      messages,
      merchantHold,
    });
    return eventKey;
  }
}
