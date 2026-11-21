import "./support/dom";
import { act, createElement, useState } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, submit, click } from "./support/form-dom";
import { EditEvent } from "../features/events/components/edit-event";
import { RosterEditor } from "../features/roster/components/roster-editor";
import { reviewRoster } from "../features/roster/lib/roster-review";
import type { SessionRequest } from "../features/auth/types";

test("event conflict preserves input and requires explicit review before using the new version", async () => {
  const writes: unknown[] = [];
  const request: SessionRequest = async <T>(
    _p: string,
    options?: RequestInit,
  ) => {
    writes.push(JSON.parse(String(options?.body)));
    return {} as T;
  };
  function Screen() {
    const [event, setEvent] = useState({
      id: "event",
      ownerId: "a",
      groupId: null,
      name: "최초",
      version: 1,
      scheduledAt: null,
      expectedGuests: null,
    });
    return createElement(
      "div",
      null,
      createElement(
        "button",
        {
          onClick: () =>
            setEvent({
              ...event,
              version: event.version + 1,
              name: "최신 이름",
            }),
        },
        "외부 변경",
      ),
      createElement(EditEvent, {
        event,
        accountId: "a",
        request,
        onClose: () => {},
      }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await fill(view.container, "name", "내 입력");
    await click(view.container, "외부 변경");
    await submit(view.container);
    assert.equal(writes.length, 0);
    assert.match(view.container.textContent!, /최신 이름/);
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="name"]')!.value,
      "내 입력",
    );
    await click(view.container, "최신 내용 확인 후 내 입력 재적용");
    await submit(view.container);
    await until(() => assert.equal(writes.length, 1));
    assert.deepEqual(writes[0], {
      name: "내 입력",
      expectedVersion: 2,
      scheduledAt: null,
    });
  } finally {
    await view.unmount();
  }
});

test("roster re-review requires reselection of changed or deleted people", async () => {
  const original = {
    id: "person",
    name: "김민수",
    phoneLast4: "1234",
    label: "기존",
  };
  const row = {
    name: original.name,
    phoneLast4: original.phoneLast4,
    label: original.label,
    match: original.id,
    parseError: "",
  };
  assert.equal(reviewRoster([row], []).issues.length, 1);
  assert.equal(
    reviewRoster([row], [{ ...original, phoneLast4: "5678" }]).issues.length,
    1,
  );
  let saved: unknown;
  function Screen() {
    const [people, setPeople] = useState([original]);
    return createElement(
      "div",
      null,
      createElement(
        "button",
        {
          onClick: () =>
            setPeople([{ ...original, phoneLast4: "5678", label: "최신" }]),
        },
        "다시 검토",
      ),
      createElement(RosterEditor, {
        existing: people,
        onBack: () => {},
        onSave: async (rows) => {
          saved = rows;
        },
      }),
    );
  }
  const view = await render(createElement(Screen));
  try {
    await click(view.container, "한 명씩 직접 추가하기");
    await fill(view.container, "members.0.name", "김민수");
    const select = () =>
      view.container.querySelector<HTMLSelectElement>("select")!;
    const choose = async () => {
      await act(async () => {
        select().value = "person";
        select().dispatchEvent(new window.Event("change", { bubbles: true }));
      });
    };
    await choose();
    await click(view.container, "다시 검토");
    await submit(view.container);
    assert.equal(saved, undefined);
    assert.match(view.container.textContent!, /변경되거나 삭제/);
    await choose();
    await submit(view.container);
    await until(() => assert(saved));
    assert.deepEqual(saved, [{ ...row, phoneLast4: "5678", label: "최신" }]);
  } finally {
    await view.unmount();
  }
});
