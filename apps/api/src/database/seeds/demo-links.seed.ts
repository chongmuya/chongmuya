import type { DataSource } from "typeorm";
import { Restaurant } from "../../modules/restaurants/entities/restaurant.entity.js";
import { RestaurantContact } from "../../modules/restaurants/entities/restaurant-contact.entity.js";
import { MerchantReplyLink } from "../../modules/reservations/entities/merchant-reply-link.entity.js";
import { RequestTarget } from "../../modules/reservations/entities/request-target.entity.js";
import { ReservationRequest } from "../../modules/reservations/entities/reservation-request.entity.js";
import { AttendanceRound } from "../../modules/events/entities/attendance-round.entity.js";
import { Event } from "../../modules/events/entities/event.entity.js";
import { merchantLinkUrl } from "../../modules/reservations/lib/merchant-link-codec.js";
import { demoAccounts } from "./demo.seed.js";

// Called only by the local/fake CLI. Never return capabilities through an HTTP API.
export async function demoLinks(db: DataSource, origin: string, key: Buffer) {
  return db.transaction("REPEATABLE READ", async (m) => {
    const links = await m
      .createQueryBuilder(MerchantReplyLink, "l")
      .innerJoin(RequestTarget, "t", "t.id=l.target_id")
      .innerJoin(
        Restaurant,
        "s",
        "s.id=t.restaurant_id AND s.is_demo=true AND s.published=true",
      )
      .innerJoin(
        RestaurantContact,
        "c",
        "c.id=l.contact_id AND c.restaurant_id=s.id AND c.active=true AND c.request_consent_at IS NOT NULL AND c.phone=l.phone_snapshot",
      )
      .innerJoin(
        ReservationRequest,
        "r",
        "r.id=t.request_id AND r.closed_at IS NULL",
      )
      .where(
        "l.revoked_at IS NULL AND l.expires_at > now() AND (r.snapshot->>'startsAt')::timestamptz > now()",
      )
      .orderBy("l.target_id")
      .getMany();
    const rounds = await m
      .createQueryBuilder(AttendanceRound, "a")
      .innerJoin(Event, "e", "e.id=a.event_id")
      .where("e.owner_id IN (:...ids)", {
        ids: demoAccounts
          .filter((a) => a.role === "organizer")
          .map((a) => a.id),
      })
      .andWhere("a.revoked_at IS NULL")
      .orderBy("a.created_at")
      .getMany();
    return {
      generatedAt: new Date().toISOString(),
      warning: "로컬 개발 전용 비밀 링크입니다. 공유·커밋하지 마세요.",
      merchantReplies: links.map((l) => ({
        targetId: l.targetId,
        linkExpiresAt: l.expiresAt.toISOString(),
        url: merchantLinkUrl(origin, l, key),
      })),
      attendance: rounds.map((a) => ({
        eventId: a.eventId,
        roundId: a.id,
        title: a.title,
        closed: !!a.closedAt,
        url: `${origin}/attendance/${a.shareId}`,
      })),
    };
  });
}
