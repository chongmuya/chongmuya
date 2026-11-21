import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import {
  KakaoWithdrawal,
  KakaoWithdrawalApp,
} from "./entities/kakao-withdrawal.entity.js";
import {
  KakaoWithdrawalProvider,
  validKakaoSubject,
} from "./kakao-withdrawal-provider.js";
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
    private readonly kakao: KakaoWithdrawalProvider,
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
    const hash = receiptHash(key);
    const result = await db.transaction(async (m) => {
      // Business writes take this account lock before assigning a reservation or ownership.
      await this.auth.lockWithdrawalSession(user, m);
      const state = await this.check(user.id, m);
      if (state.blockers.length)
        return {
          completed: false as const,
          ...state,
          request: this.summary(await this.pending(user.id, m)),
        };
      const subject = await this.auth.withdrawalKakaoSubject(user.id, m);
      if (subject !== null) {
        if (!validKakaoSubject(subject) || !this.kakao.binding())
          throw new DomainHttpException("KAKAO_CONFIGURATION");
        await this.auth.markWithdrawalStarted(user.id, m);
        await m.insert(KakaoWithdrawal, {
          accountId: user.id,
          receiptHash: hash,
          openedAt: new Date(),
        });
        return null;
      }
      await this.finish(user.id, hash, m);
      return { completed: true as const };
    });
    return result ?? this.processKakao(user.id, hash);
  }

  private async finish(
    accountId: string,
    hash: string,
    m: EntityManager,
    subject: string | null = null,
  ) {
    await this.auth.closeAccount(accountId, hash, m, subject);
    await m.update(
      AccountWithdrawalRequest,
      { accountId, resolvedAt: IsNull() },
      { resolvedAt: new Date(), resolution: "WITHDRAWN" },
    );
  }

  private async processKakao(accountId: string, hash: string) {
    const db = await this.database.connect();
    const pending = { completed: false as const, pending: true as const };
    const leaseId = randomUUID();
    const claim = await db.transaction<
      | { completed: true }
      | typeof pending
      | {
          subject: string;
          job: KakaoWithdrawal;
          binding: string;
          verified: boolean;
        }
    >(async (m) => {
      const subject = await this.auth.lockKakaoWithdrawal(accountId, m);
      const job = await m.findOneBy(KakaoWithdrawal, {
        accountId,
        receiptHash: hash,
      });
      if (!job)
        return (await this.auth.hasWithdrawalReceipt(hash, m))
          ? { completed: true as const }
          : pending;
      const binding =
        subject && validKakaoSubject(subject) ? this.kakao.binding() : null;
      if (
        !subject ||
        !binding ||
        (job.leaseUntil && job.leaseUntil > new Date())
      )
        return pending;
      if ((await this.check(accountId, m)).blockers.length) return pending;
      await m.update(
        KakaoWithdrawal,
        { accountId },
        {
          leaseId,
          leaseUntil: new Date(Date.now() + 60000),
        },
      );
      const verified = await m.existsBy(KakaoWithdrawalApp, { binding });
      return { subject, job, binding, verified };
    });
    if ("completed" in claim) return claim;
    const { subject, job, binding, verified } = claim;
    const inspected = await this.kakao.inspect(subject);
    let confirmed = inspected === "absent" && verified;
    if (inspected === "matched" && !job.unlinkStarted) {
      // An expired/crashed worker may have sent the mutation. Persist that intent before network I/O.
      const reserved = await db.transaction(async (m) => {
        if ((await this.auth.lockKakaoWithdrawal(accountId, m)) !== subject)
          return false;
        const current = await m.findOneBy(KakaoWithdrawal, {
          accountId,
          leaseId,
        });
        if (!current || !current.leaseUntil || current.leaseUntil <= new Date())
          return false;
        if ((await this.check(accountId, m)).blockers.length) return false;
        await m
          .createQueryBuilder()
          .insert()
          .into(KakaoWithdrawalApp)
          .values({ binding })
          .orIgnore()
          .execute();
        await m.update(
          KakaoWithdrawal,
          { accountId, leaseId },
          { unlinkStarted: true },
        );
        return true;
      });
      if (reserved) {
        const outcome = await this.kakao.unlink(subject);
        confirmed = outcome === "matched" || outcome === "absent";
        if (outcome === "rejected") {
          // Only a documented definitive rejection permits another mutation attempt.
          await db.manager.update(
            KakaoWithdrawal,
            { accountId, leaseId },
            { unlinkStarted: false },
          );
        }
      }
    }
    return db.transaction(async (m) => {
      const currentSubject = await this.auth.lockKakaoWithdrawal(accountId, m);
      const current = await m.findOneBy(KakaoWithdrawal, { accountId });
      if (!current)
        return (await this.auth.hasWithdrawalReceipt(hash, m))
          ? { completed: true as const }
          : pending;
      if (currentSubject !== subject || current.leaseId !== leaseId)
        return pending;
      if (confirmed && !(await this.check(accountId, m)).blockers.length) {
        await this.finish(accountId, current.receiptHash, m, subject);
        await m.delete(KakaoWithdrawal, { accountId, leaseId });
        return { completed: true as const };
      }
      await m.update(
        KakaoWithdrawal,
        { accountId, leaseId },
        { leaseId: null, leaseUntil: null },
      );
      return pending;
    });
  }

  async receipt(key: string) {
    const db = await this.database.connect();
    const hash = receiptHash(key);
    return db.transaction("REPEATABLE READ", async (m) => {
      if (await this.auth.hasWithdrawalReceipt(hash, m))
        return { completed: true as const };
      if (await m.existsBy(KakaoWithdrawal, { receiptHash: hash }))
        return { completed: false as const, pending: true as const };
      return { completed: false as const };
    });
  }

  async retry(key: string) {
    const db = await this.database.connect();
    const job = await db.manager.findOneBy(KakaoWithdrawal, {
      receiptHash: receiptHash(key),
    });
    return job
      ? this.processKakao(job.accountId, job.receiptHash)
      : this.receipt(key);
  }

  async listKakaoPending() {
    const db = await this.database.connect();
    const jobs = await db.manager.find(KakaoWithdrawal, {
      select: {
        accountId: true,
        openedAt: true,
        unlinkStarted: true,
        leaseUntil: true,
      },
      order: { openedAt: "ASC", accountId: "ASC" },
    });
    return jobs;
  }

  async retryKakaoPending(accountId: string) {
    const db = await this.database.connect();
    const job = await db.manager.findOneBy(KakaoWithdrawal, { accountId });
    if (!job) throw new NotFoundException();
    return this.processKakao(accountId, job.receiptHash);
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
