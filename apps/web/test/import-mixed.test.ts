import "./support/dom";
import { act, createElement, useState } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, click } from "./support/form-dom";
import { ImportGroupRoster } from "../features/attendance/components/import-group-roster";
import { groupKeys } from "../features/groups/api/groups.queries";
import type { GroupMember } from "../features/groups/types";
import type { ParticipantDto } from "../features/attendance/types/attendance.types";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";

type Command = {
  requestKey: string;
  members: { id: string; version: number }[];
  directMembers: {
    name: string;
    phoneLast4: string | null;
    label: string | null;
    existingParticipantId?: string;
    newPersonConfirmed: boolean;
  }[];
  expectedRoster: { id: string; version: number }[];
  duplicatesConfirmed: boolean;
};
const member = (name: string): GroupMember => ({
  id: crypto.randomUUID(),
  version: 1,
  name,
  phoneLast4: "0012",
  label: null,
});
async function choose(container: HTMLElement, value: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>("select")!;
    assert(select);
    select.value = value;
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
async function remove(container: HTMLElement, index: number) {
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${index}번 직접 입력한 사람 삭제"]`,
      )!
      .click(),
  );
}

test("mixed draft stages and removes locally, refuses to omit dirty input and retries identical group/direct data after a lost response", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    eventId = crypto.randomUUID();
  const sources = [member("선택할 사람")];
  const writes: Command[] = [],
    saved: number[] = [];
  let closed = false;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
      return { addedCount: 2 } as T;
    }
    return sources as T;
  };
  const v = await render(
    createElement(ImportGroupRoster, {
      accountId,
      groupId,
      eventId,
      request,
      existing: [],
      onClose() {
        closed = true;
      },
      onImported: (n) => saved.push(n),
    }),
  );
  try {
    await until(() =>
      assert(v.container.querySelector('input[type="checkbox"]')),
    );
    await click(v.container, "전체 선택");
    await fill(v.container, "name", "  직접 사람  ");
    await fill(v.container, "phoneLast4", "010-1234-0007");
    await click(v.container, "직접 추가");
    assert.equal(writes.length, 0);
    assert.match(
      v.container.querySelector('ol[aria-label="직접 추가한 사람"]')!
        .textContent!,
      /직접 사람0007/,
    );
    await fill(v.container, "name", "삭제할 사람");
    await click(v.container, "직접 추가");
    await remove(v.container, 2);
    assert.equal(
      v.container.querySelectorAll('ol[aria-label="직접 추가한 사람"] li')
        .length,
      1,
    );
    await fill(v.container, "name", "작성 중");
    await click(v.container, "참여자 추가하기");
    assert.equal(writes.length, 0);
    assert.match(v.container.textContent!, /먼저 직접 추가/);
    assert.equal(
      v.container.querySelector<HTMLInputElement>('input[name="name"]')!.value,
      "작성 중",
    );
    await act(async () =>
      v.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="이전 단계로 돌아가기"]',
        )!
        .click(),
    );
    assert.match(
      v.container.querySelector("dialog")!.textContent!,
      /저장되지 않아요/,
    );
    await click(v.container, "계속 작성");
    assert.equal(closed, false);
    await fill(v.container, "name", "");
    await click(v.container, "참여자 추가하기");
    await until(() =>
      assert.match(v.container.textContent!, /같은 요청 다시 확인/),
    );
    await act(async () =>
      v.cache.setQueryData(groupKeys.members(accountId, groupId), [
        { ...sources[0], version: 2 },
      ]),
    );
    assert(
      v.container.querySelector('input[name="name"]')!.matches(":disabled"),
    );
    assert(
      v.container.querySelector<HTMLButtonElement>(
        'button[aria-label="이전 단계로 돌아가기"]',
      )!.disabled,
    );
    assert.deepEqual(writes[0].members, [{ id: sources[0].id, version: 1 }]);
    assert.deepEqual(writes[0].directMembers, [
      {
        name: "직접 사람",
        phoneLast4: "0007",
        label: null,
        newPersonConfirmed: false,
      },
    ]);
    assert.deepEqual(writes[0].expectedRoster, []);
    await click(v.container, "같은 요청 다시 확인");
    await until(() => assert.deepEqual(saved, [2]));
    assert.deepEqual(writes[1], writes[0]);
  } finally {
    await v.unmount();
  }
});

test("a direct namesake of a selected group person requires a new-person choice and confirmation instead of sending a source ID as a participant", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    eventId = crypto.randomUUID();
  const sources = [member("동명이인")],
    writes: Command[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      return { addedCount: 2 } as T;
    }
    return sources as T;
  };
  const v = await render(
    createElement(ImportGroupRoster, {
      accountId,
      groupId,
      eventId,
      request,
      existing: [],
      onClose() {},
      onImported() {},
    }),
  );
  try {
    await until(() =>
      assert(v.container.querySelector('input[type="checkbox"]')),
    );
    await click(v.container, "전체 선택");
    await fill(v.container, "name", "동명이인");
    await fill(v.container, "phoneLast4", "0012");
    await click(v.container, "직접 추가");
    await click(v.container, "참여자 추가하기");
    assert.equal(writes.length, 0);
    assert.match(v.container.textContent!, /기존 구성원인지 새 동명이인인지/);
    assert.equal(
      v.container.querySelector(`option[value="${sources[0].id}"]`),
      null,
    );
    await choose(v.container, "new");
    await click(v.container, "참여자 추가하기");
    assert.equal(writes.length, 0);
    assert.match(v.container.textContent!, /동명이인을 확인해 주세요/);
    await act(async () =>
      v.container
        .querySelector<HTMLInputElement>(
          'section[aria-labelledby="import-direct-title"] input[type="checkbox"]',
        )!
        .click(),
    );
    await click(v.container, "참여자 추가하기");
    await until(() => assert.equal(writes.length, 1));
    assert.equal(writes[0].directMembers[0].newPersonConfirmed, true);
    assert.equal(writes[0].directMembers[0].existingParticipantId, undefined);
    assert.equal(writes[0].duplicatesConfirmed, true);
  } finally {
    await v.unmount();
  }
});

test("direct-only import reviews a changed event snapshot explicitly and preserves both queued rows and unfinished input", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    eventId = crypto.randomUUID();
  const person: ParticipantDto = {
    ...member("기존 이름"),
    groupMemberId: null,
  };
  const writes: Command[] = [];
  let changeRoster!: () => void;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      return { addedCount: 1 } as T;
    }
    return [] as T;
  };
  function Host() {
    const [roster, setRoster] = useState([person]);
    changeRoster = () =>
      setRoster([{ ...person, version: 2, phoneLast4: "9999" }]);
    return createElement(ImportGroupRoster, {
      accountId,
      groupId,
      eventId,
      request,
      existing: roster,
      onClose() {},
      onImported() {},
    });
  }
  const v = await render(createElement(Host));
  try {
    await until(() =>
      assert.match(v.container.textContent!, /모임 기본 명단이 비어/),
    );
    await fill(v.container, "name", "기존 이름");
    await fill(v.container, "phoneLast4", "7777");
    await click(v.container, "직접 추가");
    await choose(v.container, person.id);
    assert.match(v.container.textContent!, /이미 등록된 참여자/);
    await fill(v.container, "name", "아직 작성 중");
    await act(async () => changeRoster());
    assert(
      v.container.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled,
    );
    await click(v.container, "최신 명단으로 다시 검토");
    assert.equal(
      v.container.querySelector<HTMLInputElement>('input[name="name"]')!.value,
      "아직 작성 중",
    );
    assert.equal(
      v.container.querySelectorAll('ol[aria-label="직접 추가한 사람"] li')
        .length,
      1,
    );
    assert.match(v.container.textContent!, /선택한 참여자가 변경됐어요/);
    await choose(v.container, "new");
    assert.match(
      v.container.querySelector('ol[aria-label="직접 추가한 사람"]')!
        .textContent!,
      /7777/,
    );
    await act(async () =>
      v.container
        .querySelector<HTMLInputElement>(
          'section[aria-labelledby="import-direct-title"] input[type="checkbox"]',
        )!
        .click(),
    );
    await fill(v.container, "name", "");
    await click(v.container, "참여자 추가하기");
    await until(() => assert.equal(writes.length, 1));
    assert.deepEqual(writes[0].members, []);
    assert.deepEqual(writes[0].expectedRoster, [{ id: person.id, version: 2 }]);
    assert.equal(writes[0].directMembers[0].phoneLast4, "7777");
    assert.equal(writes[0].directMembers[0].newPersonConfirmed, true);
  } finally {
    await v.unmount();
  }
});
