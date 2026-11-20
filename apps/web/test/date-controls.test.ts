import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, useState } from "react";
import {
  isDateOnly,
  fromKoreanDateInput,
  koreanDateInput,
  koreanDateOnly,
} from "../shared/lib/korean-date";
import { safeReturnPath } from "../features/auth/lib/return-path";
import { DatePicker } from "../shared/ui/date-picker";
import { TimePicker } from "../shared/ui/time-picker";
import { render, click } from "./support/form-dom";
import { chooseDate, chooseTime } from "./support/date-controls";

test("date-only validity and explicit Korean instants survive host timezone, leap day, midnight and year boundaries", () => {
  for (const value of [
    "2026-02-30",
    "2026-02-29",
    "2026-13-01",
    "2026-00-01",
    "2026-2-01",
    "",
    "not-a-date",
  ])
    assert.equal(isDateOnly(value), false);
  for (const value of ["2028-02-29", "2026-12-31", "2027-01-01"])
    assert(isDateOnly(value));
  assert.equal(
    fromKoreanDateInput("2026-12-05T00:30"),
    "2026-12-04T15:30:00.000Z",
  );
  assert.equal(koreanDateInput("2026-12-04T15:30:00.000Z"), "2026-12-05T00:30");
  assert.equal(koreanDateOnly(new Date("2026-12-31T15:00:00Z")), "2027-01-01");
  for (const value of [
    "2026-02-30T10:10",
    "2026-12-05T24:00",
    "2026-12-05T18:60",
    "2026-12-05T",
  ])
    assert.equal(fromKoreanDateInput(value), null);
  assert.equal(
    safeReturnPath("/events?date=2026-12-05&next=https://example.test"),
    "/events?date=2026-12-05",
  );
  assert.equal(safeReturnPath("/events?date=2026-02-30"), "/events");
});
test("date confirmation and cancellation retain committed value, restore focus, and never submit the parent form", async () => {
  let submitted = 0;
  function Form() {
    const [value, setValue] = useState("2026-12-05");
    return createElement(
      "form",
      {
        onSubmit: (e) => {
          e.preventDefault();
          submitted++;
        },
      },
      createElement(DatePicker, { name: "date", value, onChange: setValue }),
    );
  }
  const view = await render(createElement(Form));
  try {
    const trigger = view.container.querySelector<HTMLButtonElement>(
      'button[name="date"]',
    )!;
    await act(async () => {
      trigger.focus();
      trigger.click();
    });
    await click(view.container, "날짜 지우기");
    await click(view.container, "취소");
    assert.match(trigger.textContent!, /2026-12-05/);
    assert.equal(document.activeElement, trigger);
    await chooseDate(view.container, "date", "2027-01-01");
    assert.match(trigger.textContent!, /2027-01-01/);
    assert.equal(submitted, 0);
  } finally {
    await view.unmount();
  }
});
test("minute precision, clearing and explicitly enabled 24:00 remain date-free", async () => {
  function Form() {
    const [value, onChange] = useState("18:10");
    return createElement(TimePicker, {
      name: "end",
      value,
      onChange,
      allowEndOfDay: true,
    });
  }
  const view = await render(createElement(Form));
  try {
    await chooseTime(view.container, "end", "19:11");
    const selects = view.container.querySelectorAll("select");
    assert.equal(selects[0].value, "19");
    assert.equal(selects[1].value, "11");
    await act(async () => {
      selects[0].value = "24";
      selects[0].dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(selects[1].value, "00");
    assert(selects[1].disabled);
    await click(view.container, "×");
    assert.equal(selects[0].value, "");
    assert.equal(selects[1].value, "");
  } finally {
    await view.unmount();
  }
});

test("external reset discards an open date draft and readOnly prevents reopening", async () => {
  function Form() {
    const [value, setValue] = useState("2026-12-05");
    const [readOnly, setReadOnly] = useState(false);
    return createElement(
      "div",
      null,
      createElement(DatePicker, {
        name: "reset-date",
        value,
        onChange: setValue,
        readOnly,
      }),
      createElement(
        "button",
        {
          onClick: () => {
            setValue("2027-01-01");
            setReadOnly(true);
          },
        },
        "외부 초기화",
      ),
    );
  }
  const view = await render(createElement(Form));
  try {
    const trigger = view.container.querySelector<HTMLButtonElement>(
      'button[name="reset-date"]',
    )!;
    await act(async () => {
      trigger.click();
    });
    await click(view.container, "날짜 지우기");
    await click(view.container, "외부 초기화");
    assert.equal(view.container.querySelector("dialog"), null);
    assert.match(trigger.textContent!, /2027-01-01/);
    await act(async () => {
      trigger.click();
    });
    assert.equal(view.container.querySelector("dialog"), null);
  } finally {
    await view.unmount();
  }
});
