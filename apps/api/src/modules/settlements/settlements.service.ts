import { NotificationsService } from "../notifications/notifications.service.js";
import type { SettlementDetailDto } from "./dto/response/settlement.response.dto.js";
import type {
  EventSummaryDto,
  MemberHistoryDto,
} from "./dto/response/event-summary.response.dto.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { EventsService } from "../events/events.service.js";
import { ReservationFactsService } from "../reservations/reservation-facts.service.js";
import { FilesService } from "../files/files.service.js";
import {
  EventSettlement,
  SettlementCommand,
  SettlementBankDefault,
} from "./entities/settlement.entity.js";
import {
  initialSettlement,
  type SettlementState,
  type Expense,
  type Notice,
} from "./types/settlement.js";
import { calculate, allocation } from "./lib/calculate.js";
import {
  commandSchema,
  type SettlementInput,
} from "./dto/request/settlement.request.dto.js";
const invalid = () => new DomainHttpException("SETTLEMENT_INVALID");
const noticeOutdated = (n: Notice, s: SettlementState) =>
  n.calculationVersion !== s.calculationVersion ||
  (n.scope === "UNCONFIRMED" &&
    JSON.stringify(n.snapshot.people.map((p) => [p.id, p.amount]).sort()) !==
      JSON.stringify(
        calculate(s)
          .people.filter((p) => p.remaining > 0)
          .map((p) => [p.person.id, p.remaining])
          .sort(),
      ));
const depositConflicts = (
  s: SettlementState,
  facts: { reservationId: string; remainingAmount: number }[],
) => {
  const balances = new Map(
    facts.map((f) => [f.reservationId, f.remainingAmount]),
  );
  const used = new Map<string, number>();
  for (const e of s.expenses)
    if (!e.deletedAt && e.reservationId)
      used.set(e.reservationId, (used.get(e.reservationId) ?? 0) + e.deposit);
  return [...used]
    .filter(([id, amount]) => amount > (balances.get(id) ?? 0))
    .map(([reservationId, applied]) => ({
      reservationId,
      applied,
      remaining: balances.get(reservationId) ?? 0,
    }));
};
@Injectable()
export class SettlementsService {
  async handoverCounts(events: string[], m: EntityManager) {
    const rows = events.length
      ? await m.findBy(EventSettlement, { eventId: In(events) })
      : [];
    return {
      settlements: rows.length,
      incompleteSettlements: rows.filter(
        (r) => calculate(r.state).status === "IN_PROGRESS",
      ).length,
    };
  }

  constructor(
    private readonly notifications: NotificationsService,
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly reservations: ReservationFactsService,
    private readonly files: FilesService,
  ) {}
  private async state(event: string, m: EntityManager) {
    return (
      (await m.findOneBy(EventSettlement, { eventId: event }))?.state ??
      initialSettlement()
    );
  }
  private depositBalances(states: Iterable<SettlementState>, m: EntityManager) {
    const ids = new Set<string>();
    for (const state of states)
      for (const expense of state.expenses)
        if (!expense.deletedAt && expense.reservationId && expense.deposit > 0)
          ids.add(expense.reservationId);
    return this.reservations.depositBalances([...ids], m);
  }
  async get(owner: string, event: string): Promise<SettlementDetailDto> {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      await this.events.assertOwned(owner, event, m);
      const s = await this.state(event, m);
      const reservations = await this.reservations.forEvent(owner, event, m);
      const conflicts = depositConflicts(s, reservations);
      return {
        depositConflicts: conflicts,
        state: {
          ...s,
          notices: s.notices.map((n) => ({
            id: n.id,
            title: n.title,
            createdAt: n.createdAt,
            calculationVersion: n.calculationVersion,
            outdated:
              !!conflicts.length || noticeOutdated(n, s) || n.actorId !== owner,
            deadline: n.deadline,
            ownerChanged: n.actorId !== owner,
          })),
        },
        summary: calculate(s),
        facts: await this.events.settlementFacts(owner, event, m),
        reservations,
        bankDefault:
          (await m.findOneBy(SettlementBankDefault, { accountId: owner }))
            ?.bank ?? null,
      };
    });
  }
  async summaries(
    owner: string,
    eventIds: string[],
  ): Promise<EventSummaryDto[]> {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const facts = await this.events.progressFacts(owner, eventIds, m);
      const rows = await m.findBy(EventSettlement, { eventId: In(eventIds) });
      const states = new Map(rows.map((row) => [row.eventId, row.state]));
      const balances = await this.depositBalances(states.values(), m);
      const reservations = await this.reservations.forEvents(
        owner,
        eventIds,
        m,
      );
      return reservations.map((reservation) => {
        const counts = facts.find((f) => f.eventId === reservation.eventId)!;
        const state = states.get(reservation.eventId) ?? initialSettlement();
        const summary = calculate(state);
        return {
          ...reservation,
          participantCount: counts.participantCount,
          roundCount: counts.roundCount,
          attendingCount: counts.attendingCount,
          settlement: {
            status: summary.status,
            needsReview: depositConflicts(state, balances).length > 0,
            total: summary.total,
            target: summary.target,
            confirmed: summary.confirmed,
            unconfirmed: summary.unconfirmed,
            drafts: summary.drafts,
            differences: summary.differences,
          },
        };
      });
    });
  }
  async memberHistory(
    owner: string,
    group: string,
    member: string,
    offset: number,
  ): Promise<MemberHistoryDto> {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const facts = await this.events.memberHistoryFacts(
        owner,
        group,
        member,
        m,
      );
      const ids = facts.map((f) => f.eventId);
      const rows = ids.length
        ? await m.findBy(EventSettlement, { eventId: In(ids) })
        : [];
      const states = new Map(rows.map((row) => [row.eventId, row.state]));
      const history = facts.map(({ participantIds, ...fact }) => {
        const summary = calculate(
          states.get(fact.eventId) ?? initialSettlement(),
        );
        const participants = new Set(participantIds);
        return {
          ...fact,
          contributionAmount: summary.people.reduce(
            (sum, person) =>
              sum + (participants.has(person.person.id) ? person.amount : 0),
            0,
          ),
          settlementStatus: summary.status,
        };
      });
      return {
        count: history.length,
        attendedEventCount: history.filter((event) => event.attending).length,
        contributionTotal: history.reduce(
          (sum, event) => sum + event.contributionAmount,
          0,
        ),
        events: history.slice(offset, offset + 20),
      };
    });
  }
  async notice(owner: string, event: string, id: string) {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      await this.events.assertOwned(owner, event, m);
      const s = await this.state(event, m);
      const n = s.notices.find((notice) => notice.id === id);
      if (!n) throw new NotFoundException();
      const needsReview =
        depositConflicts(s, await this.depositBalances([s], m)).length > 0;
      return {
        ...n,
        needsReview,
        outdated: needsReview || noticeOutdated(n, s) || n.actorId !== owner,
      };
    });
  }
  async records(
    owner: string,
    options: {
      groupId?: string;
      scope?: "personal";
      search?: string;
      before?: string;
      after?: string;
      offset: number;
    },
  ) {
    if (options.scope && options.groupId) throw invalid();
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const page = await this.events.recordPage(owner, m, options),
        ids = page.events.map((e) => e.id);
      const states = ids.length
        ? await m.find(EventSettlement, { where: { eventId: In(ids) } })
        : [];
      const files = await this.files.metadata(owner, ids, m);
      const balances = await this.depositBalances(
        states.map((row) => row.state),
        m,
      );
      return {
        count: page.count,
        events: page.events.map((e) => {
          const s =
              states.find((s) => s.eventId === e.id)?.state ??
              initialSettlement(),
            c = calculate(s);
          return {
            ...e,
            total: c.total,
            confirmed: c.confirmed,
            status: c.status,
            needsReview: depositConflicts(s, balances).length > 0,
            files: files.filter((f) => f.eventId === e.id),
          };
        }),
      };
    });
  }
  async command(owner: string, event: string, input: unknown) {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    const c = parsed.data,
      digest = createHash("sha256").update(JSON.stringify(c)).digest("hex");
    const db = await this.database.connect();
    await db.transaction(async (m) => {
      const eventInfo = await this.events.assertOwned(owner, event, m, true);
      const old = await m.findOneBy(SettlementCommand, {
        eventId: event,
        requestKey: c.requestKey,
      });
      if (old) {
        if (old.digest !== digest)
          throw new DomainHttpException("SETTLEMENT_REQUEST_CONFLICT");
        return;
      }
      const s = await this.state(event, m);
      if (s.version !== c.expectedVersion)
        throw new DomainHttpException("SETTLEMENT_CONFLICT");
      const beforeSummary = calculate(s);
      await this.apply(owner, event, s, c, m);
      try {
        calculate(s);
      } catch {
        throw invalid();
      }
      s.version++;
      const summary = calculate(s);
      const completed =
        summary.status === "COMPLETE" && beforeSummary.status !== "COMPLETE";
      if (completed || (c.action === "NOTICE" && summary.unconfirmed > 0))
        await this.notifications.record(m, {
          eventKey: `settlement:${event}:${c.requestKey}`,
          kind: completed ? "SETTLEMENT_COMPLETED" : "SETTLEMENT_REQUIRED",
          category: "SETTLEMENT",
          eventId: event,
          requestId: c.requestKey,
          revision: s.version,
          accounts: [
            {
              id: owner,
              title: completed ? "정산이 완료됐어요" : "정산 확인이 필요해요",
              summary: completed
                ? `${eventInfo.name} · 현재 정산 내역의 입금 확인이 완료됐어요.`
                : `${eventInfo.name} · 미확인 ${summary.unconfirmed}명 · 정산 내역을 확인해 주세요.`,
              destination: `/events?event=${event}&view=settlement`,
            },
          ],
          messages: [],
        });
      await m.save(m.create(EventSettlement, { eventId: event, state: s }));
      await m.save(
        m.create(SettlementCommand, {
          eventId: event,
          requestKey: c.requestKey,
          digest,
          actorId: owner,
          action: c.action,
          version: s.version,
          createdAt: new Date(),
          snapshot: structuredClone(s),
        }),
      );
    });
    return {
      ...(await this.get(owner, event)),
      createdNoticeId: c.action === "NOTICE" ? c.requestKey : null,
    };
  }
  private async apply(
    owner: string,
    event: string,
    s: SettlementState,
    c: SettlementInput,
    m: EntityManager,
  ) {
    const now = new Date().toISOString();
    if (c.action === "MEMO") {
      s.memo = c.memo;
      return;
    }
    if (c.action === "EXPENSE") {
      if (
        s.expenses.filter((e) => !e.deletedAt).length >= 200 &&
        !s.expenses.some((e) => e.id === c.id)
      )
        throw invalid();
      const facts = await this.events.settlementFacts(owner, event, m);
      if (!facts.rounds.some((r) => r.id === c.roundId)) throw invalid();
      const pick = (p: { id: string; version: number }) => {
        const row = facts.participants.find((r) => r.id === p.id);
        if (!row || row.version !== p.version)
          throw new DomainHttpException("SETTLEMENT_CONFLICT");
        return {
          id: row.id,
          name: row.name,
          label: row.label,
          phoneLast4: row.phoneLast4,
          version: row.version,
        };
      };
      const prev = s.expenses.find((e) => e.id === c.id);
      if (prev?.deletedAt) throw invalid();
      const e: Expense = {
        id: c.id,
        roundId: c.roundId,
        name: c.name,
        total: c.total,
        deposit: c.deposit,
        includeDeposit: c.includeDeposit,
        support: c.support,
        reservationId: c.reservationId,
        memo: c.memo,
        payers: c.payers.map(pick),
        remainder: c.remainder ? pick(c.remainder) : null,
        fileIds: c.fileIds,
        version: (prev?.version ?? 0) + 1,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      try {
        allocation(e);
      } catch {
        throw invalid();
      }
      if (c.reservationId) {
        const fact = (await this.reservations.forEvent(owner, event, m)).find(
          (r) => r.reservationId === c.reservationId,
        );
        const used = s.expenses
          .filter(
            (e) =>
              !e.deletedAt &&
              e.id !== c.id &&
              e.reservationId === c.reservationId,
          )
          .reduce((n, e) => n + e.deposit, 0);
        if (!fact || used + c.deposit > fact.remainingAmount) throw invalid();
      }
      await this.files.link(owner, event, c.id, c.fileIds, m);
      if (prev) s.expenses[s.expenses.indexOf(prev)] = e;
      else s.expenses.push(e);
      s.calculationVersion++;
      return;
    }
    if (c.action === "DELETE_EXPENSE") {
      const e = s.expenses.find((e) => e.id === c.id && !e.deletedAt);
      if (!e) throw new NotFoundException();
      e.deletedAt = now;
      e.updatedAt = now;
      e.version++;
      await this.files.link(owner, event, e.id, [], m);
      s.calculationVersion++;
      return;
    }
    const summary = calculate(s);
    if (c.action === "RECEIPT" || c.action === "RETURN") {
      const row = summary.people.find((p) => p.person.id === c.participantId);
      if (!row) throw invalid();
      if (
        c.action === "RECEIPT" &&
        (c.calculationVersion !== s.calculationVersion ||
          c.amount !== row.remaining)
      )
        throw new DomainHttpException("SETTLEMENT_CONFLICT");
      if (
        c.action === "RETURN" &&
        (c.amount > row.net || Date.parse(c.returnedAt) > Date.now())
      )
        throw invalid();
      s.payments.push({
        id: randomUUID(),
        participant: row.person,
        kind: c.action,
        ...(c.action === "RETURN" ? { returnedAt: c.returnedAt } : {}),
        amount: c.amount,
        corrects: null,
        reason: c.action === "RETURN" ? c.reason : "입금 사실 확인",
        actorId: owner,
        at: now,
        calculationVersion: s.calculationVersion,
      });
      return;
    }
    if (c.action === "CORRECTION") {
      const p = s.payments.find((p) => p.id === c.paymentId);
      if (
        !p ||
        p.kind === "CORRECTION" ||
        s.payments.some((v) => v.corrects === p.id)
      )
        throw invalid();
      s.payments.push({
        ...p,
        id: randomUUID(),
        kind: "CORRECTION",
        corrects: p.id,
        reason: c.reason,
        actorId: owner,
        at: now,
        calculationVersion: s.calculationVersion,
      });
      try {
        calculate(s);
      } catch {
        throw invalid();
      }
      return;
    }
    if (c.action === "NOTICE") {
      if (
        depositConflicts(s, await this.reservations.forEvent(owner, event, m))
          .length
      )
        throw new DomainHttpException("SETTLEMENT_CONFLICT");
      if (summary.drafts || summary.status === "EMPTY")
        throw new DomainHttpException("SETTLEMENT_DRAFT");
      const prev = c.replaces
        ? s.notices.find((n) => n.id === c.replaces)
        : null;
      if (c.replaces && !prev) throw new NotFoundException();
      // Editing creates a new generation against current facts; previous text is immutable.
      const people = summary.people
        .filter((p) => (c.scope === "ALL" ? p.amount > 0 : p.remaining > 0))
        .map((p) => ({
          id: p.person.id,
          name: p.person.name,
          label: p.person.label,
          amount: c.scope === "ALL" ? p.amount : p.remaining,
        }));
      const requested = people.reduce((n, p) => n + p.amount, 0);
      if (requested > 0 && !c.bank) throw invalid();
      const expenses = s.expenses.filter((e) => !e.deletedAt);
      const lines = [
        `[${c.title}]`,
        c.message,
        `전체 이용 금액: ${summary.total.toLocaleString("ko-KR")}원`,
        ...expenses.map(
          (e) =>
            `${e.name}: ${e.total.toLocaleString("ko-KR")}원 / 예약금 제외 ${e.includeDeposit ? 0 : e.deposit}원 / 회비·지원금 ${e.support}원`,
        ),
        `정산 대상: ${summary.target.toLocaleString("ko-KR")}원`,
        `${c.scope === "ALL" ? "전체 분담액" : "입금 미확인 잔액"}: ${requested.toLocaleString("ko-KR")}원`,
      ];
      if (c.includePeople)
        lines.push(
          ...people.map(
            (p) =>
              `${p.name}${p.label ? ` (${p.label})` : ""}: ${p.amount.toLocaleString("ko-KR")}원`,
          ),
        );
      if (requested && c.bank)
        lines.push(
          `은행: ${c.bank.bank}`,
          `계좌: ${c.bank.account}`,
          `예금주: ${c.bank.holder}`,
          `확인 기한: ${c.deadline ?? "별도 안내"}`,
        );
      else lines.push("추가 입금 요청이 없습니다.");
      const n: Notice = {
        id: c.requestKey,
        replaces: c.replaces,
        title: c.title,
        message: c.message,
        bank: c.bank,
        deadline: c.deadline,
        includePeople: c.includePeople,
        scope: c.scope,
        text: lines.filter(Boolean).join("\n"),
        calculationVersion: s.calculationVersion,
        createdAt: now,
        actorId: owner,
        snapshot: {
          expenses: structuredClone(expenses),
          people,
          total: summary.total,
          target: summary.target,
        },
      };
      s.notices.push(n);
      if (c.saveBank && c.bank)
        await m.upsert(
          SettlementBankDefault,
          { accountId: owner, bank: c.bank },
          ["accountId"],
        );
      return;
    }
  }
}
