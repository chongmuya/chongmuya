import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { EventSummaryDto } from "../../src/modules/settlements/dto/response/event-summary.response.dto.js";
import type { SettlementDetailDto } from "../../src/modules/settlements/dto/response/settlement.response.dto.js";
import { startResourceApplication } from "../support/resource-application.js";

async function json<T>(response: Response, status = 200): Promise<T> {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body as T;
}

test("only the current manager can finalize a record, with explicit confirmation for an empty settlement", async (t) => {
  const { call, signup } = await startResourceApplication(t);
  const owner = await signup();
  const stranger = await signup();
  const { id } = await json<{ id: string }>(
    await call("events", owner, "POST", { name: "마무리 통합 테스트" }),
    201,
  );
  const path = `events/${id}/settlement`;
  const readSummary = async (jar = owner) => {
    const [summary] = await json<EventSummaryDto[]>(
      await call(`settlements/summaries?eventIds=${id}`, jar),
    );
    assert(summary);
    return summary;
  };
  const command = {
    action: "FINALIZE_EVENT",
    requestKey: randomUUID(),
    expectedVersion: 0,
    noExpenses: true,
  };
  assert.equal((await readSummary()).finalizedAt, null);
  assert.equal((await call(path, stranger, "POST", { command })).status, 404);
  assert.equal(
    (
      await json<{ code: string }>(
        await call(path, owner, "POST", {
          command: { ...command, noExpenses: false },
        }),
        400,
      )
    ).code,
    "EVENT_FINALIZATION_CONFIRMATION_REQUIRED",
  );

  const complete = await json<SettlementDetailDto>(
    await call(path, owner, "POST", { command }),
  );
  assert(complete.state.finalizedAt);
  assert.equal(complete.state.version, command.expectedVersion);
  assert.equal(complete.state.calculationVersion, 0);
  assert.deepEqual(complete.state.expenses, []);
  assert.deepEqual(complete.state.payments, []);
  assert.equal(complete.summary.status, "EMPTY");
  const replay = await json<SettlementDetailDto>(
    await call(path, owner, "POST", { command }),
  );
  assert.equal(replay.state.finalizedAt, complete.state.finalizedAt);
  assert.equal(replay.state.version, complete.state.version);

  const { email } = await json<{ email: string }>(await call("auth/me", owner));
  const login = await call("auth/login", "", "POST", {
    email,
    password: "group-events-123",
  });
  assert.equal(login.ok, true);
  const secondDevice = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert(secondDevice);
  assert.equal(
    (await readSummary(secondDevice)).finalizedAt,
    complete.state.finalizedAt,
  );

  const round = await json<{ id: string }>(
    await call(`events/${id}/attendance-rounds`, owner, "POST", {
      requestKey: randomUUID(),
      title: "식사",
    }),
    201,
  );
  assert.equal((await readSummary()).attendanceComplete, false);
  const changed = await json<SettlementDetailDto>(
    await call(path, owner, "POST", {
      command: {
        action: "EXPENSE",
        requestKey: randomUUID(),
        expectedVersion: complete.state.version,
        id: randomUUID(),
        roundId: round.id,
        name: "식사비",
        total: 20000,
        deposit: 0,
        includeDeposit: true,
        support: 0,
        reservationId: null,
        memo: "",
        payers: [],
        remainder: null,
        fileIds: [],
      },
    }),
  );
  assert.equal(changed.summary.status, "IN_PROGRESS");
  const reopened = await readSummary();
  assert.equal(reopened.settlement.status, "IN_PROGRESS");
  assert.equal(reopened.finalizedAt, complete.state.finalizedAt);
  assert.equal(
    (
      await json<{ code: string }>(
        await call(path, owner, "POST", {
          command: {
            ...command,
            requestKey: randomUUID(),
            expectedVersion: changed.state.version,
          },
        }),
        409,
      )
    ).code,
    "EVENT_FINALIZATION_BLOCKED",
  );
});
