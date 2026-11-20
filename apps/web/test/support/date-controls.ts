import assert from "node:assert/strict";
import { act } from "react";
import { click } from "./form-dom";
export async function chooseDate(
  container: HTMLElement,
  name: string,
  value: string,
) {
  const trigger = container.querySelector<HTMLButtonElement>(
    `button[name="${name}"]`,
  );
  assert(trigger);
  await act(async () => trigger.click());
  const wantedMonth = `${Number(value.slice(0, 4))}년 ${Number(value.slice(5, 7))}월`;
  for (let i = 0; i < 120; i++) {
    const caption =
      container.querySelector("dialog .service-calendar [class*='caption']")
        ?.textContent ??
      container.querySelector("dialog .service-calendar .text-center")
        ?.textContent;
    const date = container.querySelector<HTMLButtonElement>(
      `dialog button[aria-label^="${Number(value.slice(0, 4))}년 ${Number(value.slice(5, 7))}월 ${Number(value.slice(8))}일"]`,
    );
    if (date) {
      await act(async () => date.click());
      await click(container, "확인");
      return;
    }
    const numbers = caption?.match(/(\d+)년\s*(\d+)월/);
    assert(numbers, `calendar caption ${caption}; wanted ${wantedMonth}`);
    const direction =
      `${numbers[1]}-${numbers[2].padStart(2, "0")}` > value.slice(0, 7)
        ? "이전 달"
        : "다음 달";
    const next = container.querySelector<HTMLButtonElement>(
      `dialog button[aria-label="${direction}"]`,
    )!;
    await act(async () => next.click());
  }
  assert.fail("date outside tested calendar range");
}
export async function chooseTime(
  container: HTMLElement,
  name: string,
  value: string,
) {
  const hour = container.querySelector<HTMLSelectElement>(
    `select[name="${name}"]`,
  )!;
  assert(hour);
  const minute = hour.parentElement!.querySelectorAll("select")[1];
  for (const [element, part] of [
    [hour, value.slice(0, 2)],
    [minute, value.slice(3, 5)],
  ] as const) {
    await act(async () => {
      element.value = part;
      element.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  }
}
