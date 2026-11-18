import { randomUUID } from "node:crypto";
import { MessageDelivery } from "../entities/message-delivery.entity.js";
import type { MerchantReplyLink } from "../entities/merchant-reply-link.entity.js";
import type { ReservationRequest } from "../entities/reservation-request.entity.js";
import type { RequestTarget } from "../entities/request-target.entity.js";

export function newMessageDelivery(
  request: ReservationRequest,
  target: RequestTarget,
  link: MerchantReplyLink,
  purpose: string,
  id: string = randomUUID(),
  now = new Date(),
): MessageDelivery {
  const s = request.snapshot;
  return Object.assign(new MessageDelivery(), {
    id,
    targetId: target.id,
    purpose,
    channel: "LMS",
    contactId: link.contactId,
    phoneSnapshot: link.phoneSnapshot,
    linkGeneration: link.generation,
    templateVersion: 1,
    variables: {
      restaurantName: target.restaurantName,
      eventName: s.eventName,
      startsAt: s.startsAt,
      expectedGuests: s.expectedGuests,
      space: s.space,
    },
    status: "PENDING",
    attempts: 0,
    startedAt: null,
    leaseUntil: null,
    providerMessageId: null,
    providerGroupId: null,
    provider: null,
    failureStage: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
  });
}
