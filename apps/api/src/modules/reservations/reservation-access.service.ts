import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationManagementLink } from "./entities/reservation-progress.entity.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { MerchantReplyLink } from "./entities/merchant-reply-link.entity.js";
import {
  issueMerchantToken,
  merchantTokenDigest,
  merchantEncryptionKey,
  merchantLinkUrl,
} from "./lib/merchant-link-codec.js";
import type { ReservationAudit } from "./types/reservation-completion.js";
@Injectable()
export class ReservationAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly restaurants: RestaurantsService,
  ) {}
  url(link: ReservationManagementLink) {
    return merchantLinkUrl(
      this.config.environment.webOrigin,
      { targetId: link.reservationId, encryptedToken: link.encryptedToken },
      merchantEncryptionKey(this.config.environment),
    ).replace("/merchant-reply?target=", "/reservation-manage?reservation=");
  }
  async issue(
    selection: SelectedReservation,
    target: RequestTarget,
    m: EntityManager,
    audit: ReservationAudit,
    contactId?: string,
  ) {
    const old = await m.findOneBy(ReservationManagementLink, {
      reservationId: selection.id,
    });
    const inquiry = await m.findOneBy(MerchantReplyLink, {
      targetId: target.id,
    });
    const current = contactId ?? old?.contactId ?? inquiry?.contactId;
    if (!current) throw new DomainHttpException("RESERVATION_ACCESS_INVALID");
    const recipient = await this.restaurants.deliveryRecipient(
      target.restaurantId,
      current,
      m,
    );
    const link = await m.save(ReservationManagementLink, {
      reservationId: selection.id,
      ...issueMerchantToken(merchantEncryptionKey(this.config.environment)),
      contactId: recipient.contactId,
      phoneSnapshot: recipient.contactPhone,
      generation: (old?.generation ?? 0) + 1,
      expiresAt: new Date(
        Date.now() +
          this.config.environment.reservationManagementTtlHours * 3600_000,
      ),
      revokedAt: null,
      audit,
    });
    return link;
  }
  // Caller holds the reservation business lock. Never infer a changed recipient.
  async forNotification(
    selection: SelectedReservation,
    target: RequestTarget,
    m: EntityManager,
    audit: ReservationAudit,
    inFlight: boolean,
  ): Promise<
    | { link: ReservationManagementLink; reason?: never }
    | { link?: never; reason: string }
  > {
    const link = await m.findOneBy(ReservationManagementLink, {
      reservationId: selection.id,
    });
    if (
      selection.targetId !== target.id ||
      target.candidateState !== "SELECTED"
    )
      return { reason: "RESERVATION_ACCESS_INVALID" };
    if (!link) return { reason: "MANAGEMENT_LINK_MISSING" };
    if (link.revokedAt) return { reason: "MANAGEMENT_LINK_REVOKED" };
    const [reasons] = await this.restaurants.deliveryEligibility(
      [
        {
          restaurantId: target.restaurantId,
          contactId: link.contactId,
          contactPhone: link.phoneSnapshot,
        },
      ],
      m,
      false,
    );
    if (reasons.length) return { reason: reasons[0]! };
    if (link.expiresAt.getTime() > Date.now()) return { link };
    if (inFlight) return { reason: "DELIVERY_UNRESOLVED" };
    Object.assign(
      link,
      issueMerchantToken(merchantEncryptionKey(this.config.environment)),
      {
        generation: link.generation + 1,
        expiresAt: new Date(
          Date.now() +
            this.config.environment.reservationManagementTtlHours * 3600_000,
        ),
        audit,
      },
    );
    return { link: await m.save(link) };
  }
  private invalid(): never {
    throw new DomainHttpException("RESERVATION_ACCESS_INVALID");
  }
  private signature(payload: string) {
    return createHmac("sha256", this.config.environment.authSecret)
      .update(`reservation-management:${payload}`)
      .digest("base64url");
  }
  async valid(id: string, m: EntityManager) {
    const selection = await m.findOneBy(SelectedReservation, { id });
    const link = await m.findOneBy(ReservationManagementLink, {
      reservationId: id,
    });
    const target = selection
      ? await m.findOneBy(RequestTarget, { id: selection.targetId })
      : null;
    if (
      !selection ||
      !target ||
      target.candidateState !== "SELECTED" ||
      !link ||
      link.revokedAt ||
      link.expiresAt.getTime() <= Date.now()
    )
      this.invalid();
    const [reasons] = await this.restaurants.deliveryEligibility(
      [
        {
          restaurantId: target.restaurantId,
          contactId: link.contactId,
          contactPhone: link.phoneSnapshot,
        },
      ],
      m,
      false,
    );
    if (reasons.length) this.invalid();
    return link;
  }
  async exchange(id: string, token: string, ip: string) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `reservation-management:${ip}`, 120);
    await consumeRequestLimit(
      db.manager,
      `reservation-management:${id}:${ip}`,
      20,
    );
    const link = await this.valid(id, db.manager);
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !timingSafeEqual(
        Buffer.from(merchantTokenDigest(token), "hex"),
        Buffer.from(link.digest, "hex"),
      )
    )
      this.invalid();
    const expiresAt = Math.min(Date.now() + 3600_000, link.expiresAt.getTime());
    const payload = Buffer.from(
      JSON.stringify({
        purpose: "RESERVATION_MANAGEMENT",
        id,
        generation: link.generation,
        expiresAt,
      }),
    ).toString("base64url");
    return {
      accessToken: `${payload}.${this.signature(payload)}`,
      accessExpiresAt: new Date(expiresAt).toISOString(),
      linkExpiresAt: link.expiresAt.toISOString(),
    };
  }
  async authorize(id: string, access: string | undefined, m: EntityManager) {
    if (!access || access.length > 1000) this.invalid();
    const [payload, sig, extra] = access.split(".");
    if (
      !payload ||
      !sig ||
      extra ||
      !/^[A-Za-z0-9_-]{43}$/.test(sig) ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(this.signature(payload)))
    )
      this.invalid();
    let data: {
      id?: string;
      purpose?: string;
      generation?: number;
      expiresAt?: number;
    };
    try {
      data = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      this.invalid();
    }
    const link = await this.valid(id, m);
    if (
      data.id !== id ||
      data.purpose !== "RESERVATION_MANAGEMENT" ||
      data.generation !== link.generation ||
      typeof data.expiresAt !== "number" ||
      data.expiresAt <= Date.now()
    )
      this.invalid();
    return link;
  }
}
