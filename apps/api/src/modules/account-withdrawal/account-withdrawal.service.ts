import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { GroupsService } from "../groups/groups.service.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationWithdrawalService } from "../reservations/reservation-withdrawal.service.js";
import {
  AccountWithdrawalRequest,
  AccountWithdrawalRequestKey,
} from "./entities/account-withdrawal-request.entity.js";

const receiptHash = (key: string) =>
  createHash("sha256").update(`withdrawal:${key}`).digest("hex");

@Injectable()
export class AccountWithdrawalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly groups: GroupsService,
    private readonly restaurants: RestaurantsService,
    private readonly reservations: ReservationWithdrawalService,
  ) {}

  private async check(accountId: string, m: EntityManager) {
    const restaurantIds = await this.restaurants.ownedIds(accountId, m);
    const bookings = await this.reservations.blockers(
      accountId,
      m,
      restaurantIds,
    );
    const ownsGroup = await this.groups.ownsGroup(accountId, m);
    const blockers = [
      ...(bookings.inquiries.length ? (["OPEN_INQUIRY"] as const) : []),
      ...(bookings.reservations.length
        ? (["ACTIVE_RESERVATION"] as const)
        : []),
      ...(ownsGroup ? (["GROUP_OWNER"] as const) : []),
      ...(restaurantIds.length ? (["RESTAURANT_OWNER"] as const) : []),
    ];
    const destinations = [
      ...new Set(
        [...bookings.inquiries, ...bookings.reservations].filter(
          (href) => href !== null,
        ),
      ),
    ];
    return {
      blockers,
      inquiries: bookings.inquiries.length,
      reservations: bookings.reservations.length,
      destinations,
    };
  }

  private async pending(accountId: string, m: EntityManager) {
    return m.findOneBy(AccountWithdrawalRequest, {
      accountId,
      resolvedAt: IsNull(),
    });
  }

  private summary(request: AccountWithdrawalRequest | null) {
    return request
      ? {
          id: request.id,
          openedAt: request.openedAt,
          reviewed: request.resolution === "REVIEWED",
        }
      : null;
  }

  async status(user: AuthUser) {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => ({
      ...(await this.check(user.id, m)),
      request: this.summary(
        await m.findOne(AccountWithdrawalRequest, {
          where: { accountId: user.id },
          order: { openedAt: "DESC", id: "DESC" },
        }),
      ),
    }));
  }

  async request(user: AuthUser, requestKey: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await this.auth.lockWithdrawalSession(user, m);
      const state = await this.check(user.id, m);
      const retry = await m.findOneBy(AccountWithdrawalRequestKey, {
        accountId: user.id,
        requestKey,
      });
      if (retry) {
        const existing = await m.findOneByOrFail(AccountWithdrawalRequest, {
          id: retry.requestId,
          accountId: user.id,
        });
        return { ...state, request: this.summary(existing) };
      }
      if (!state.blockers.length) return { ...state, request: null };
      const request =
        (await this.pending(user.id, m)) ??
        (await m.save(AccountWithdrawalRequest, {
          id: randomUUID(),
          accountId: user.id,
          blockers: state.blockers,
          openedAt: new Date(),
          resolvedAt: null,
          resolution: null,
          reviewedBy: null,
        }));
      await m.insert(AccountWithdrawalRequestKey, {
        accountId: user.id,
        requestKey,
        requestId: request.id,
      });
      return { ...state, request: this.summary(request) };
    });
  }

  async complete(user: AuthUser, key: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      // Each path that can create a new reservation responsibility or attach
      // exclusive ownership takes this same account lock before writing.
      await this.auth.lockWithdrawalSession(user, m);
      const state = await this.check(user.id, m);
      if (state.blockers.length)
        return {
          completed: false as const,
          ...state,
          request: this.summary(await this.pending(user.id, m)),
        };
      await this.auth.closeAccount(user.id, receiptHash(key), m);
      await m.update(
        AccountWithdrawalRequest,
        { accountId: user.id, resolvedAt: IsNull() },
        {
          resolvedAt: new Date(),
          resolution: "WITHDRAWN",
        },
      );
      return { completed: true as const };
    });
  }

  async receipt(key: string) {
    const db = await this.database.connect();
    return {
      completed: await this.auth.hasWithdrawalReceipt(
        receiptHash(key),
        db.manager,
      ),
    };
  }

  async listPending() {
    const db = await this.database.connect();
    return db.manager.find(AccountWithdrawalRequest, {
      where: { resolvedAt: IsNull() },
      select: { id: true, accountId: true, openedAt: true, blockers: true },
      order: { openedAt: "ASC", id: "ASC" },
    });
  }

  async review(id: string, actor: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const request = await m.findOne(AccountWithdrawalRequest, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!request) throw new NotFoundException();
      if (!request.resolvedAt) {
        request.resolvedAt = new Date();
        request.resolution = "REVIEWED";
        request.reviewedBy = actor;
        await m.save(request);
      }
      return {
        id,
        resolvedAt: request.resolvedAt,
        resolution: request.resolution,
        reviewedBy: request.reviewedBy,
      };
    });
  }
}
