import type { EventsService } from "../../../events/events.service.js";
import type { ReservationFactsService } from "../../../reservations/reservation-facts.service.js";
import type { calculate } from "../../lib/calculate.js";
import type { SettlementState, Bank } from "../../types/settlement.js";
export type SettlementSummaryDto = ReturnType<typeof calculate>;
export type SettlementDetailDto = {
  state: Omit<SettlementState, "notices" | "finalizedAt"> & {
    finalizedAt: string | null;
    notices: {
      id: string;
      title: string;
      createdAt: string;
      calculationVersion: number;
      outdated: boolean;
      deadline: string | null;
      ownerChanged: boolean;
    }[];
  };
  summary: SettlementSummaryDto;
  depositConflicts?: {
    reservationId: string;
    applied: number;
    remaining: number;
  }[];
  bankDefault: Bank | null;
  facts: Awaited<ReturnType<EventsService["settlementFacts"]>>;
  reservations: Awaited<ReturnType<ReservationFactsService["forEvent"]>>;
};
