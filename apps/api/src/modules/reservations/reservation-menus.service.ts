import { Injectable } from "@nestjs/common";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationCompletionService } from "./reservation-completion.service.js";
import {
  draftCommand,
  menuCommand,
  type ReservationPrincipal,
} from "./types/reservation-completion.js";
import { calculateOrder, guidanceReady } from "./lib/reservation-completion.js";
@Injectable()
export class ReservationMenusService {
  constructor(
    private readonly completion: ReservationCompletionService,
    private readonly restaurants: RestaurantsService,
  ) {}
  draft(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "MENU_DRAFT",
      draftCommand,
      raw,
      "organizer",
      async (c, input) => {
        this.completion.active(c);
        if (c.state.order)
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        c.state.draft = {
          catalogVersion: input.catalogVersion,
          items: input.items,
        };
      },
    );
  }
  submit(id: string, p: ReservationPrincipal, raw: unknown) {
    return this.completion.write(
      id,
      p,
      "MENU_SUBMITTED",
      menuCommand,
      raw,
      "organizer",
      async (c, input) => {
        this.completion.active(c);
        const s = c.state;
        if (s.order)
          throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
        if (!guidanceReady(s) || s.guidance.revision !== input.guidanceRevision)
          throw new DomainHttpException("RESERVATION_GUIDANCE_PENDING");
        const catalog = await this.restaurants.reservationMenu(
          c.target.restaurantId,
          c.m,
          true,
        );
        s.order = calculateOrder(
          catalog,
          input.items,
          input.catalogVersion,
          s.agreement,
          1,
        );
        s.draft = null;
        s.acknowledgedRevision = input.guidanceRevision;
        s.acknowledgedAt = new Date().toISOString();
        if (input.transfer) {
          if (s.guidance.kind !== "REQUIRED")
            throw new DomainHttpException("RESERVATION_ACTION_BLOCKED");
          s.transfer = {
            ...input.transfer,
            guidanceRevision: input.guidanceRevision,
            reportedAt: new Date().toISOString(),
          };
        }
        await this.completion.notify(
          c,
          "MENU_SUBMITTED",
          input.transfer
            ? "메뉴와 총무의 송금 신고가 도착했어요. 은행 실입금은 별도로 확인해 주세요."
            : "주문 메뉴가 도착했어요. 예약 관리에서 확인해 주세요.",
          "merchant",
        );
      },
    );
  }
}
