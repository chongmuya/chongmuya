import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GroupRegistration } from "../features/groups/components/group-registration";
import {
  duplicateNames,
  parseRoster,
} from "../features/groups/lib/parse-roster";
import { rosterRowSchema } from "../features/groups/schemas/group-registration.schema";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";

test("roster import preserves same-name people and zeroes; ambiguous columns require review", () => {
  const rows = parseRoster(
    "\ufeff1. 김민수\t0012\r\n- 김민수\nAlex Kim\t1234\n한명,또한명\n이름\t0007\t추가 열",
  );
  assert.equal(rows.length, 6);
  assert.deepEqual(duplicateNames(rows), ["김민수"]);
  assert.equal(rows[0].phoneLast4, "0012");
  assert.equal(rows[2].name, "Alex Kim");
  assert.equal(rosterRowSchema.safeParse(rows[5]).success, false);
  assert.equal(
    rosterRowSchema.safeParse(parseRoster("김민수,12")[0]).success,
    false,
  );
  assert.equal(
    rosterRowSchema.safeParse(parseRoster("김민수,0012")[0]).success,
    true,
  );
  assert.throws(() => parseRoster("x\u0000y"));
  const missingName = parseRoster("\t0012")[0];
  assert.equal(missingName.name, "");
  assert.equal(missingName.phoneLast4, "0012");
  assert.equal(rosterRowSchema.safeParse(missingName).success, false);
  assert.throws(() => parseRoster("김민수\n".repeat(501)));
});

async function setup(request: SessionRequest) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const navigations: string[] = [];
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: cache },
        createElement(GroupRegistration, {
          accountId: "a",
          request,
          onNavigate: (path) => navigations.push(path),
        }),
      ),
    ),
  );
  return {
    container,
    cache,
    navigations,
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
      cache.clear();
    },
  };
}
async function fill(container: HTMLElement, name: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  );
  assert(input, name);
  await act(async () => {
    const prototype =
      input.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  assert(button, text);
  await act(async () => button.click());
}
async function submit(container: HTMLElement) {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
}
async function until(check: () => void) {
  for (let i = 0; ; i++) {
    try {
      check();
      return;
    } catch (error) {
      if (i === 100) throw error;
    }
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

test("registration retains edits across back, excludes invalid rows, confirms duplicates and retries with one key", async () => {
  const writes: {
    name: string;
    creationKey: string;
    groupType: string;
    members: unknown[];
    duplicatesConfirmed: boolean;
  }[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    writes.push(JSON.parse(String(options?.body)));
    if (writes.length === 1)
      throw new ApiError("offline", 503, "NETWORK_ERROR");
    return {
      id: "saved",
      name: "사진 모임",
      groupType: "동아리",
      memberCount: 2,
    } as T;
  };
  const view = await setup(request);
  try {
    await submit(view.container);
    assert.match(view.container.textContent!, /이름을 입력/);
    await fill(view.container, "name", " 사진 모임 ");
    await fill(view.container, "groupType", "동아리");
    await submit(view.container);
    await fill(
      view.container,
      "source",
      "김민수\t0012\n김민수\n잘못된 번호\t123",
    );
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /뒤 4자리를 입력하거나/),
    );
    const exclude = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="3번 구성원 제외"]',
    )!;
    await act(async () => exclude.click());
    await fill(view.container, "members.1.phoneLast4", "0007");
    const back = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="이전 단계로 돌아가기"]',
    )!;
    await act(async () => back.click());
    await click(view.container, "수정하던 명단 2명으로 돌아가기");
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="members.1.phoneLast4"]',
      )!.value,
      "0007",
    );
    await submit(view.container);
    assert.equal(writes.length, 0);
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    await submit(view.container);
    await until(() => assert.equal(writes.length, 1));
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        '[name="members.0.phoneLast4"]',
      )!.value,
      "0012",
    );
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /모임이 만들어졌어요/),
    );
    assert.deepEqual(writes[0], writes[1]);
    assert.match(writes[0].creationKey, /^[0-9a-f-]{36}$/);
    assert.deepEqual(writes[1].members, [
      { name: "김민수", phoneLast4: "0012" },
      { name: "김민수", phoneLast4: "0007" },
    ]);
    assert.equal(writes[1].groupType, "동아리");
    assert.equal(writes[1].duplicatesConfirmed, true);
    await click(view.container, "홈으로 가기");
    assert.deepEqual(view.navigations, ["/?group=saved"]);
  } finally {
    await view.close();
  }
});

test("TXT upload validates encoding/type and corrected import errors can be saved", async () => {
  const writes: unknown[] = [];
  const view = await setup(async <T>(_path: string, options?: RequestInit) => {
    writes.push(JSON.parse(String(options?.body)));
    return {
      id: "txt",
      name: "TXT 모임",
      groupType: null,
      memberCount: 2,
    } as T;
  });
  const upload = async (file: File) => {
    const input =
      view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    await act(async () =>
      input.dispatchEvent(new window.Event("change", { bubbles: true })),
    );
  };
  try {
    await fill(view.container, "name", "TXT 모임");
    await submit(view.container);
    await upload(new File(["test"], "roster.csv"));
    assert.match(view.container.textContent!, /UTF-8 TXT 파일/);
    await upload(new File([new Uint8Array([0xff, 0xfe])], "invalid.txt"));
    await until(() =>
      assert.match(view.container.textContent!, /TXT를 읽지 못했어요/),
    );
    await upload(new File(["\t0012\n김총무\t0007\t불필요한 열"], "roster.txt"));
    await until(() =>
      assert(view.container.querySelector('[name="members.1.name"]')),
    );
    await fill(view.container, "members.0.name", "이름 복구");
    await fill(view.container, "members.1.name", "김총무 수정");
    await submit(view.container);
    await until(() => assert.equal(writes.length, 1));
    assert.deepEqual((writes[0] as { members: unknown[] }).members, [
      { name: "이름 복구", phoneLast4: "0012" },
      { name: "김총무 수정", phoneLast4: "0007" },
    ]);
    assert.doesNotMatch(view.container.textContent!, /두 열만 입력/);
  } finally {
    await view.close();
  }
});

test("skip saves an empty roster and late creation after leaving never restores cache or navigation", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  let body: { members: unknown[] } | undefined;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    body = JSON.parse(String(options?.body));
    return (await pending) as T;
  };
  const view = await setup(request);
  await fill(view.container, "name", "모임만");
  await submit(view.container);
  await click(view.container, "명단 없이 모임 만들기");
  assert.deepEqual(body?.members, []);
  await view.close();
  await act(async () => {
    resolve({ id: "late", name: "모임만", groupType: null, memberCount: 0 });
    await pending;
  });
  assert.equal(view.cache.getQueryCache().getAll().length, 0);
  assert.deepEqual(view.navigations, []);
});
