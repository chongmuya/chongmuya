import { ReservationNotificationsService } from "./reservation-notifications.service.js";
import { isDeepStrictEqual } from "node:util";
import { candidateState } from "./lib/candidate-state.js";
import { replyView } from "./lib/reply-view.js";
import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { MerchantLinksService } from "./merchant-links.service.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import { replySchema } from "./types/merchant-reply.js";
import type {
  MerchantReplyInput,
  ReplyActor,
  Proposal,
} from "./types/merchant-reply.js";

type Principal =
  | { kind: "link"; access: string | undefined }
  | { kind: "owner"; user: AuthUser }
  | {
      kind: "operator";
      actor: string;
      method: string;
      confirmedAt: string;
      reason: string;
    };
@Injectable()
export class MerchantRepliesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly restaurants: RestaurantsService,
    private readonly links: MerchantLinksService,
    private readonly notifications: ReservationNotificationsService,
  ) {}
  private async authorize(
    targetId: string,
    principal: Principal,
    m: EntityManager,
    lock = false,
    allowClosed = false,
  ) {
    if (principal.kind === "link")
      return this.links.authorize(
        targetId,
        principal.access,
        m,
        lock,
        allowClosed,
      );
    const c = await this.links.context(targetId, m, lock);
    if (principal.kind === "owner") {
      if (principal.user.accountType !== "owner")
        throw new DomainHttpException("OWNER_REQUIRED");
      await this.restaurants.assertOwned(
        principal.user.id,
        c.target.restaurantId,
        m,
      );
    } else if (
      !principal.actor.trim() ||
      !principal.reason.trim() ||
      !["PHONE", "SMS"].includes(principal.method) ||
      !Number.isFinite(Date.parse(principal.confirmedAt)) ||
      Date.parse(principal.confirmedAt) > Date.now()
    )
      throw new DomainHttpException("VALIDATION_FAILED");
    if (
      !allowClosed &&
      (c.request.closedAt ||
        c.target.candidateState !== "OPEN" ||
        new Date(c.request.snapshot.startsAt).getTime() <= Date.now())
    )
      throw new DomainHttpException("MERCHANT_LINK_INVALID");
    return c;
  }
  async get(targetId: string, principal: Principal) {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const c = await this.authorize(targetId, principal, m, false, true);
      const response = await m.findOneBy(MerchantReplyRevision, {
        targetId,
        revision: c.target.replyVersion,
      });
      const state = candidateState(c.target, response, new Date());
      const snapshot = c.request.snapshot;
      const { defaults, proposal } = await this.proposal(
        c.target.restaurantId,
        snapshot,
        m,
      );
      const defaultExpires = new Date(Date.now() + 12 * 3600_000);
      const { menuDeadlineAt } = proposal;
      const validDefault =
        defaultExpires.getTime() <
        Math.min(
          Date.parse(snapshot.startsAt),
          menuDeadlineAt ? Date.parse(menuDeadlineAt) : Infinity,
        );
      return {
        targetId,
        closedState:
          c.target.candidateState !== "OPEN"
            ? c.target.candidateState
            : state === "EXPIRED"
              ? "EXPIRED"
              : c.request.closedAt
                ? "INQUIRY_CLOSED"
                : null,
        restaurantName: c.target.restaurantName,
        snapshot,
        organizerName: c.request.contactName,
        version: c.target.replyVersion,
        response: replyView(response),
        defaults: {
          proposal,
          expiresAt: validDefault ? defaultExpires.toISOString() : null,
          depositDescription: defaults.depositPolicy,
          bookingDescription: defaults.bookingPolicy,
          menuDescription: defaults.menuPolicy,
        },
        linkExpiresAt: c.link?.expiresAt.toISOString() ?? null,
      };
    });
  }
  private async proposal(
    restaurantId: string,
    snapshot: Pick<
      Proposal,
      "startsAt" | "expectedGuests" | "space" | "seating"
    >,
    m: EntityManager,
  ) {
    const defaults = await this.restaurants.replyDefaults(restaurantId, m);
    const deadline = defaults.policies?.menuDeadline;
    const menuDeadlineAt =
      deadline &&
      deadline.value !== null &&
      ["DAYS_BEFORE", "HOURS_BEFORE"].includes(deadline.kind)
        ? new Date(
            new Date(snapshot.startsAt).getTime() -
              deadline.value *
                (deadline.kind === "DAYS_BEFORE" ? 24 : 1) *
                3600_000,
          ).toISOString()
        : null;
    const proposal: Proposal = {
      startsAt: snapshot.startsAt,
      expectedGuests: snapshot.expectedGuests,
      space: snapshot.space,
      seating: snapshot.seating,
      minimumSpend:
        defaults.policies?.minimumOrder.kind === "AMOUNT"
          ? defaults.policies.minimumOrder.amount
          : null,
      separateFee: null,
      deposit: defaults.policies?.deposit ?? {
        kind: "UNKNOWN",
        amount: null,
      },
      menuDeadlineAt,
      note: "",
    };
    return { defaults, proposal };
  }
  async save(targetId: string, principal: Principal, raw: unknown, ip: string) {
    const parsed = replySchema.safeParse(raw);
    if (!parsed.success) throw new DomainHttpException("VALIDATION_FAILED");
    const input = parsed.data;
    const db = await this.database.connect();
    await consumeRequestLimit(
      db.manager,
      `merchant-write:${targetId}:${ip}`,
      30,
    );
    await consumeRequestLimit(db.manager, `merchant-write-ip:${ip}`, 150);
    const digest = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    let requestId: string | undefined;
    const result = await db.transaction(async (m) => {
      const c = await this.authorize(targetId, principal, m, true, true);
      requestId = c.request.id;
      const existing = await m.findOneBy(MerchantReplyRevision, {
        targetId,
        requestKey: input.requestKey,
      });
      if (existing) {
        if (existing.digest !== digest)
          throw new DomainHttpException("MERCHANT_REPLY_CONFLICT");
        return {
          response: replyView(existing),
          version: existing.revision,
        };
      }
      if (
        c.request.state !== "ACTIVE" ||
        c.target.candidateState !== "OPEN" ||
        Date.parse(c.request.snapshot.startsAt) <= Date.now()
      )
        throw new DomainHttpException("RESERVATION_PROPOSAL_UNAVAILABLE");
      if (c.target.replyVersion !== input.expectedVersion)
        throw new DomainHttpException("MERCHANT_REPLY_CONFLICT");
      this.validate(input, c.request.snapshot);
      if (
        input.kind === "CHANGE" &&
        input.proposal &&
        !input.proposal.note.trim()
      ) {
        const { proposal } = await this.proposal(
          c.target.restaurantId,
          c.request.snapshot,
          m,
        );
        if (
          isDeepStrictEqual(
            {
              ...input.proposal,
              startsAt: Date.parse(input.proposal.startsAt),
              note: "",
            },
            { ...proposal, startsAt: Date.parse(proposal.startsAt) },
          )
        )
          throw new DomainHttpException("VALIDATION_FAILED");
      }
      const current = c.target.replyVersion
        ? await m.findOneBy(MerchantReplyRevision, {
            targetId,
            revision: c.target.replyVersion,
          })
        : null;
      if (current?.expiresAt && current.expiresAt.getTime() <= Date.now())
        throw new DomainHttpException("RESERVATION_PROPOSAL_UNAVAILABLE");
      if (
        current &&
        current.kind === input.kind &&
        current.reason === input.reason &&
        (current.expiresAt?.getTime() ?? null) ===
          (input.expiresAt ? Date.parse(input.expiresAt) : null) &&
        isDeepStrictEqual(current.snapshot.offered, input.proposal)
      )
        return { response: replyView(current), version: current.revision };
      const actor: ReplyActor =
        principal.kind === "link"
          ? { kind: "MERCHANT_LINK", id: `${targetId}:${c.link!.generation}` }
          : principal.kind === "owner"
            ? { kind: "OWNER_ACCOUNT", id: principal.user.id }
            : {
                kind: "OPERATOR_RECORDED",
                id: principal.actor,
                method: principal.method,
                reason: principal.reason,
                confirmedAt: principal.confirmedAt,
              };
      const p = input.proposal;
      const row = await m.save(MerchantReplyRevision, {
        id: randomUUID(),
        targetId,
        revision: c.target.replyVersion + 1,
        requestKey: input.requestKey,
        digest,
        kind: input.kind,
        snapshot: {
          offered: p,
          holdConfirmed: input.holdConfirmed,
          requested: c.request.snapshot,
        },
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        actor,
        createdAt: new Date(),
      });
      c.target.replyVersion = row.revision;
      await m.save(c.target);
      c.request.version++;
      await m.save(c.request);
      await this.notifications.organizer(
        m,
        c.request,
        c.target,
        "REPLY_RECEIVED",
        row.revision,
      );
      return { response: replyView(row), version: row.revision };
    });
    if (requestId) await this.notifications.dispatchRequest(requestId);
    return result;
  }
  private validate(
    input: MerchantReplyInput,
    requested: {
      startsAt: string;
      expectedGuests: number;
      space: string;
      seating: string;
    },
  ) {
    const invalid = () => {
      throw new DomainHttpException("VALIDATION_FAILED");
    };
    if (input.kind === "DECLINE") {
      if (
        !input.reason.trim() ||
        input.proposal ||
        input.expiresAt ||
        input.holdConfirmed
      )
        invalid();
      return;
    }
    const p = input.proposal;
    if (!p || !input.expiresAt || !input.holdConfirmed) return invalid();
    if (
      Date.parse(p.startsAt) <= Date.now() ||
      Date.parse(input.expiresAt) <= Date.now() ||
      Date.parse(input.expiresAt) >
        Math.min(
          Date.parse(p.startsAt),
          Date.parse(requested.startsAt),
          p.menuDeadlineAt ? Date.parse(p.menuDeadlineAt) : Infinity,
        )
    )
      invalid();
    if (
      p.menuDeadlineAt &&
      Date.parse(p.menuDeadlineAt) > Date.parse(p.startsAt)
    )
      invalid();
    if (
      p.deposit.kind === "NONE"
        ? p.deposit.amount !== 0
        : p.deposit.kind === "FIXED"
          ? !p.deposit.amount
          : p.deposit.amount !== null
    )
      invalid();
    if (
      input.kind === "AVAILABLE" &&
      (Date.parse(p.startsAt) !== Date.parse(requested.startsAt) ||
        p.expectedGuests !== requested.expectedGuests ||
        p.space !== requested.space ||
        p.seating !== requested.seating)
    )
      invalid();
  }
}
