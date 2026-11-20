import type { ReservationFactsService } from "../../../reservations/reservation-facts.service.js";
import type { SettlementSummaryDto } from "./settlement.response.dto.js";

export type EventSummaryDto = Awaited<
  ReturnType<ReservationFactsService["forEvents"]>
>[number] & {
  participantCount: number;
  roundCount: number;
  attendingCount: number;
  settlement: Pick<
    SettlementSummaryDto,
    | "status"
    | "total"
    | "target"
    | "confirmed"
    | "unconfirmed"
    | "drafts"
    | "differences"
  > & { needsReview: boolean };
};

export type MemberHistoryDto = {
  count: number;
  attendedEventCount: number;
  contributionTotal: number;
  events: {
    eventId: string;
    name: string;
    startsAt: string | null;
    attending: boolean;
    contributionAmount: number;
    settlementStatus: SettlementSummaryDto["status"];
  }[];
};
