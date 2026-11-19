import type { SettlementDetailDto } from "./dto/response/settlement.response.dto.js";
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
@Injectable()
export class SettlementsService {
  constructor(
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
  async get(owner: string, event: string): Promise<SettlementDetailDto> {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      await this.events.assertOwned(owner, event, m);
      const s = await this.state(event, m);
      return {
        state: {
          ...s,
          notices: s.notices.map((n) => ({
            id: n.id,
            title: n.title,
            createdAt: n.createdAt,
            calculationVersion: n.calculationVersion,
            outdated: n.calculationVersion !== s.calculationVersion,
          })),
        },
        summary: calculate(s),
        facts: await this.events.settlementFacts(owner, event, m),
        reservations: await this.reservations.forEvent(owner, event, m),
        bankDefault:
          (await m.findOneBy(SettlementBankDefault, { accountId: owner }))
            ?.bank ?? null,
      };
    });
  }
  async notice(owner: string, event: string, id: string) {
    const db = await this.database.connect();
    await this.events.assertOwned(owner, event, db.manager);
    const s = await this.state(event, db.manager),
      n = s.notices.find((n) => n.id === id);
    if (!n) throw new NotFoundException();
    return { ...n, outdated: n.calculationVersion !== s.calculationVersion };
  }
  async records(
    owner: string,
    options: {
      groupId?: string;
      search?: string;
      before?: string;
      after?: string;
      offset: number;
    },
  ) {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const page = await this.events.recordPage(owner, m, options),
        ids = page.events.map((e) => e.id);
      const states = ids.length
        ? await m.find(EventSettlement, { where: { eventId: In(ids) } })
        : [];
      const files = await this.files.metadata(owner, ids, m);
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
      await this.events.assertOwned(owner, event, m, true);
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
      await this.apply(owner, event, s, c, m);
      try {
        calculate(s);
      } catch {
        throw invalid();
      }
      s.version++;
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
    return this.get(owner, event);
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
      if (c.action === "RETURN" && c.amount > row.net) throw invalid();
      s.payments.push({
        id: randomUUID(),
        participant: row.person,
        kind: c.action,
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
        id: randomUUID(),
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
