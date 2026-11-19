import { Injectable, NotFoundException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  merchantTokenDigest as digest,
  merchantEncryptionKey,
  issueMerchantToken,
  merchantLinkUrl,
} from "./lib/merchant-link-codec.js";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { MerchantReplyLink } from "./entities/merchant-reply-link.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
@Injectable()
export class MerchantLinksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly restaurants: RestaurantsService,
  ) {}
  url(link: MerchantReplyLink) {
    try {
      return merchantLinkUrl(
        this.config.environment.webOrigin,
        link,
        merchantEncryptionKey(this.config.environment),
      );
    } catch {
      throw new DomainHttpException("MESSAGE_CONFIGURATION");
    }
  }
  async create(
    target: RequestTarget,
    request: ReservationRequest,
    manager: EntityManager,
    generation = 1,
    recipient = {
      contactId: target.contactId,
      contactPhone: target.contactPhone,
    },
  ) {
    const token = issueMerchantToken(
      merchantEncryptionKey(this.config.environment),
    );
    return manager.save(MerchantReplyLink, {
      targetId: target.id,
      contactId: recipient.contactId,
      phoneSnapshot: recipient.contactPhone,
      ...token,
      generation,
      revokedAt: null,
      expiresAt: new Date(
        Math.min(
          Date.now() + this.config.environment.merchantReplyTtlHours * 3600_000,
          new Date(request.snapshot.startsAt).getTime(),
        ),
      ),
    });
  }
  async context(targetId: string, m: EntityManager, lock = false) {
    const target = await m.findOne(RequestTarget, {
      where: { id: targetId },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!target) throw new NotFoundException();
    const request = await m.findOneByOrFail(ReservationRequest, {
      id: target.requestId,
    });
    const link = await m.findOneBy(MerchantReplyLink, { targetId });
    return { target, request, link };
  }
  recipient(target: RequestTarget, link: MerchantReplyLink | null) {
    return {
      restaurantId: target.restaurantId,
      contactId: link?.contactId ?? target.contactId,
      contactPhone: link?.phoneSnapshot ?? target.contactPhone,
    };
  }
  async reasons(
    target: RequestTarget,
    request: ReservationRequest,
    link: MerchantReplyLink | null,
    m: EntityManager,
    liveDelivery = false,
  ) {
    const [recipientReasons] = await this.restaurants.deliveryEligibility(
      [this.recipient(target, link)],
      m,
      liveDelivery,
    );
    return [...recipientReasons, ...this.linkReasons(request, link)];
  }
  linkReasons(request: ReservationRequest, link: MerchantReplyLink | null) {
    const reasons: string[] = [];
    if (
      request.closedAt ||
      new Date(request.snapshot.startsAt).getTime() <= Date.now()
    )
      reasons.push("INQUIRY_CLOSED");
    if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now())
      reasons.push("LINK_INVALID");
    return reasons;
  }
  private invalid(): never {
    throw new DomainHttpException("MERCHANT_LINK_INVALID");
  }
  async exchange(targetId: string, raw: string, ip: string) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `merchant-exchange:${ip}`, 120);
    await consumeRequestLimit(
      db.manager,
      `merchant-exchange:${targetId}:${ip}`,
      20,
    );
    const c = await this.context(targetId, db.manager).catch(
      (error: unknown) => {
        if (error instanceof NotFoundException) this.invalid();
        throw error;
      },
    );
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(raw) ||
      !c.link ||
      !timingSafeEqual(
        Buffer.from(digest(raw), "hex"),
        Buffer.from(c.link.digest, "hex"),
      ) ||
      (await this.reasons(c.target, c.request, c.link, db.manager)).length
    )
      this.invalid();
    const accessExpiresAt = Math.min(
      Date.now() + 3600_000,
      c.link.expiresAt.getTime(),
    );
    const payload = Buffer.from(
      JSON.stringify({
        targetId,
        generation: c.link.generation,
        expiresAt: accessExpiresAt,
      }),
    ).toString("base64url");
    return {
      accessToken: `${payload}.${this.sign(payload)}`,
      accessExpiresAt: new Date(accessExpiresAt).toISOString(),
      linkExpiresAt: c.link.expiresAt.toISOString(),
    };
  }
  private sign(value: string) {
    return createHmac("sha256", this.config.environment.authSecret)
      .update(`merchant-access:${value}`)
      .digest("base64url");
  }
  async authorize(
    targetId: string,
    access: string | undefined,
    m: EntityManager,
    lock = false,
  ) {
    if (!access || access.length > 1000) this.invalid();
    const [payload, signature, extra] = access.split(".");
    if (
      extra ||
      !payload ||
      !signature ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(payload)))
    )
      this.invalid();
    let decoded: { targetId?: string; generation?: number; expiresAt?: number };
    try {
      decoded = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as typeof decoded;
    } catch {
      this.invalid();
    }
    const c = await this.context(targetId, m, lock).catch((error: unknown) => {
      if (error instanceof NotFoundException) this.invalid();
      throw error;
    });
    if (
      decoded.targetId !== targetId ||
      decoded.generation !== c.link?.generation ||
      typeof decoded.expiresAt !== "number" ||
      (await this.reasons(c.target, c.request, c.link, m)).length
    )
      this.invalid();
    if (decoded.expiresAt! <= Date.now())
      throw new DomainHttpException("MERCHANT_ACCESS_EXPIRED");
    return c;
  }
}
