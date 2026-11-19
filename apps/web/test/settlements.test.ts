import "./support/dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { render, until, click, fill, submit } from "./support/form-dom";
import { ApiError } from "../shared/http/api-error";
import { useSettlementCommand } from "../features/settlements/hooks/use-settlement-command";
import {
  settlementQuery,
  settlementKey,
} from "../features/settlements/api/settlement.api";
import { CommandStatus } from "../features/settlements/components/command-status";
import { ExpenseForm } from "../features/settlements/components/expense-form";
import { preview } from "../features/settlements/lib/preview";
import type {
  Detail,
  Access,
} from "../features/settlements/types/settlement.types";
const participant = "00000000-0000-4000-8000-000000000001",
  round = "00000000-0000-4000-8000-000000000002";
const fixture = (): Detail => ({
  state: {
    version: 1,
    calculationVersion: 1,
    expenses: [],
    payments: [],
    notices: [],
    memo: "",
  },
  summary: {
    total: 0,
    target: 0,
    drafts: 0,
    received: 0,
    confirmed: 0,
    unconfirmed: 0,
    differences: 0,
    people: [],
    status: "EMPTY",
  },
  facts: {
    participants: [
      {
        id: participant,
        name: "김민수",
        label: "A",
        phoneLast4: "0012",
        version: 1,
      },
    ],
    rounds: [{ id: round, title: "1차", attendingIds: [participant] }],
    attendingCount: 1,
  },
  reservations: [],
  bankDefault: null,
});
test("web preview follows integer examples including support and outside remainder", () => {
  assert.equal(preview(500000, 100000, true, 0, 3, true).target, 500000);
  assert.equal(preview(500000, 100000, false, 50000, 3, true).target, 350000);
  assert.equal(preview(500000, 100000, true, 150000, 3, true).target, 350000);
  assert.equal(preview(50000, 0, true, 50000, 0, false).draft, false);
  assert(preview(50000, 30000, false, 30000, 3, true).error);
  assert.equal(preview(10000, 0, true, 0, 30, true).rest, 10);
  assert.equal(preview(10000, 0, true, 0, 3, true).each, 3333);
  assert.equal(preview(10000, 0, true, 0, 0, false).draft, true);
  for (const value of [NaN, Infinity, -1, 1.5, 2000000001])
    assert(preview(value, 0, true, 0, 3, true).error);
});
test("lost return response freezes original version/input/key across refetch then allows a distinct command", async () => {
  let current = fixture(),
    lose = true;
  const writes: Record<string, unknown>[] = [],
    applied = new Set<string>();
  const a: Access = {
    accountId: "a",
    eventId: "e",
    request: async <T>(_path: string, o?: RequestInit) => {
      if (!o?.body) return structuredClone(current) as T;
      const { command } = JSON.parse(String(o.body));
      writes.push(command);
      if (!applied.has(command.requestKey)) {
        applied.add(command.requestKey);
        current = {
          ...current,
          state: { ...current.state, version: current.state.version + 1 },
        };
      }
      if (lose) {
        lose = false;
        throw new ApiError("", 0, "NETWORK_ERROR");
      }
      return structuredClone(current) as T;
    },
  };
  function Screen() {
    const q = useQuery(settlementQuery(a)),
      c = useSettlementCommand(a);
    return createElement(
      "div",
      null,
      createElement("span", null, `version ${q.data?.state.version}`),
      createElement(
        "button",
        {
          disabled: c.uncertain,
          onClick: () =>
            c.mutate({
              action: "RETURN",
              expectedVersion: q.data!.state.version,
              amount: 2000,
            }),
        },
        "반환 기록",
      ),
      createElement(CommandStatus, { command: c }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await until(() => assert.match(view.container.textContent!, /version 1/));
    await click(view.container, "반환 기록");
    await until(() => assert.match(view.container.textContent!, /version 2/));
    assert.equal(view.container.querySelector("button")?.disabled, true);
    await click(view.container, "같은 요청 재시도");
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(applied.size, 1);
    await until(() =>
      assert.equal(view.container.querySelector("button")?.disabled, false),
    );
    await click(view.container, "반환 기록");
    await until(() => assert.equal(applied.size, 2));
    assert.equal(writes[2]!.expectedVersion, 2);
    assert.notEqual(writes[2]!.requestKey, writes[0]!.requestKey);
  } finally {
    await view.unmount();
  }
});
test("expense preserves input while roster identity review removes stale selections", async () => {
  const writes: unknown[] = [];
  const a: Access = {
    accountId: "a",
    eventId: "e",
    request: async <T>(p: string, o?: RequestInit) => {
      if (p.endsWith("files"))
        return {
          files: [],
          limits: { bytesPerFile: 10485760, count: 100, totalBytes: 524288000 },
        } as T;
      if (o?.body) writes.push(JSON.parse(String(o.body)));
      return fixture() as T;
    },
  };
  function Screen() {
    const [data, setData] = useState(fixture());
    return createElement(
      "div",
      null,
      createElement(
        "button",
        {
          onClick: () =>
            setData({
              ...data,
              state: { ...data.state, version: 2 },
              facts: {
                ...data.facts,
                participants: [
                  {
                    ...data.facts.participants[0]!,
                    name: "수정 이름",
                    version: 2,
                  },
                ],
              },
            }),
        },
        "명단 변경",
      ),
      createElement(ExpenseForm, { access: a, data, onClose: () => {} }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await fill(view.container, "name", "한글 지출");
    await fill(view.container, "total", "10000");
    await click(view.container, "이 차수 참석자를 선택에 반영");
    await click(view.container, "명단 변경");
    await click(view.container, "최신 내용 확인 · 입력 재검토");
    assert.match(view.container.textContent!, /변경·삭제된 사람의 선택을 해제/);
    assert.equal(
      (view.container.querySelector('input[name="name"]') as HTMLInputElement)
        .value,
      "한글 지출",
    );
    await submit(view.container);
    await until(() => assert.equal(writes.length, 1));
    assert.deepEqual(
      (writes[0] as { command: { payers: unknown[] } }).command.payers,
      [],
    );
  } finally {
    await view.unmount();
  }
});
test("late settlement response cannot restore previous account cache after unmount", async () => {
  let finish!: (d: Detail) => void;
  const a: Access = {
    accountId: "old",
    eventId: "e",
    request: async <T>() =>
      new Promise<Detail>((r) => {
        finish = r;
      }) as Promise<T>,
  };
  function Screen() {
    const c = useSettlementCommand(a);
    return createElement(
      "button",
      {
        onClick: () =>
          c.mutate({ action: "MEMO", memo: "private", expectedVersion: 1 }),
      },
      "저장",
    );
  }
  const view = await render(createElement(Screen));
  await click(view.container, "저장");
  await view.unmount();
  finish(fixture());
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(view.cache.getQueryData(settlementKey(a)), undefined);
});

test("switching settlement tabs preserves an unresolved return command", async () => {
  const { SettlementWorkspace } =
    await import("../features/settlements/components/settlement-workspace");
  let current = fixture(),
    lose = true;
  current.summary = {
    ...current.summary,
    status: "IN_PROGRESS",
    received: 10000,
    target: 8000,
    people: [
      {
        person: current.facts.participants[0]!,
        amount: 8000,
        net: 10000,
        remaining: 0,
        excess: 2000,
        rounds: {},
      },
    ],
  };
  const writes: Record<string, unknown>[] = [];
  const request: Access["request"] = async <T>(_p: string, o?: RequestInit) => {
    if (!o?.body) return current as T;
    const { command } = JSON.parse(String(o.body));
    writes.push(command);
    current = { ...current, state: { ...current.state, version: 2 } };
    if (lose) {
      lose = false;
      throw new ApiError("", 0, "NETWORK_ERROR");
    }
    return current as T;
  };
  const view = await render(
    createElement(SettlementWorkspace, {
      accountId: "a",
      eventId: "e",
      request,
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /개인별 정산/));
    await click(view.container, "개인별 정산");
    await click(view.container, "실제 반환 기록");
    await fill(view.container, "reason", "실제 확인");
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /같은 요청 재시도/),
    );
    await click(view.container, "지출 확인");
    await click(view.container, "개인별 정산");
    await click(view.container, "같은 요청 재시도");
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0], writes[1]);
  } finally {
    await view.unmount();
  }
});

test("a deleted receipt can be explicitly deselected before saving an expense", async () => {
  const { EventFiles } =
    await import("../features/files/components/event-files");
  const a: Access = {
    accountId: "a",
    eventId: "e",
    request: async <T>() =>
      ({
        files: [],
        limits: { bytesPerFile: 10485760, count: 100, totalBytes: 524288000 },
      }) as T,
  };
  function Screen() {
    const [ids, setIds] = useState(["deleted"]);
    return createElement(EventFiles, {
      access: a,
      selected: ids,
      onSelect: setIds,
    });
  }
  const view = await render(createElement(Screen));
  try {
    await until(() =>
      assert.match(
        view.container.textContent!,
        /현재 연결할 수 없는 이전 영수증/,
      ),
    );
    await click(view.container, "이 영수증 연결 선택 해제");
    assert.doesNotMatch(
      view.container.textContent!,
      /현재 연결할 수 없는 이전 영수증/,
    );
  } finally {
    await view.unmount();
  }
});
