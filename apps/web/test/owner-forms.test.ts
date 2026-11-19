import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, submit, click } from "./support/form-dom";
import { OwnerMenus } from "../features/owner/components/owner-menus";
import { OwnerRegistration } from "../features/owner/components/owner-registration";
import type { RegistrationData } from "../features/owner/schemas/registration.schema";
import type { RestaurantDraft } from "../features/owner/types/owner.types";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";
import { merchantAccount } from "./support/owner-account";

test("existing owner menu response fields cannot leak into edit input; edit and stop sale persist", async () => {
  const menu = {
    id: crypto.randomUUID(),
    restaurantId: crypto.randomUUID(),
    name: "기존 메뉴",
    kind: "REGULAR",
    price: null,
    unit: "1인분",
    available: true,
    position: 0,
  };
  let version = 1;
  let written: Record<string, unknown> | undefined;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      assert.equal(body.version, version);
      assert.equal(body.menu.restaurantId, undefined);
      written = body.menu;
      Object.assign(menu, body.menu);
      return { version: ++version } as T;
    }
    return { version, menus: [menu] } as T;
  };
  const view = await render(
    createElement(OwnerMenus, {
      account: merchantAccount,
      request,
      restaurantId: menu.restaurantId,
      onNavigate: () => {},
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /기존 메뉴/));
    await click(view.container, "수정");
    await fill(view.container, "name", "수정 메뉴");
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('input[name="available"]')!
        .click(),
    );
    await submit(view.container);
    await until(() => assert.equal(written?.available, false));
    assert.equal(written?.name, "수정 메뉴");
    assert.equal(written?.id, menu.id);
    await click(view.container, "수정");
    await fill(view.container, "name", "다시 수정");
    await submit(view.container);
    await until(() => assert.equal(written?.name, "다시 수정"));
  } finally {
    await view.unmount();
  }
});

test("menu editing keeps its base version across background refetch", async () => {
  const menu = {
    id: crypto.randomUUID(),
    name: "원본",
    kind: "REGULAR",
    price: 1000,
    unit: "개",
    available: true,
    position: 0,
  };
  let version = 1;
  let submittedVersion: number | undefined;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      submittedVersion = JSON.parse(String(options.body)).version;
      throw new ApiError("", 409, "RESTAURANT_VERSION_CONFLICT");
    }
    return structuredClone({ version, menus: [menu] }) as T;
  };
  const view = await render(
    createElement(OwnerMenus, {
      account: merchantAccount,
      request,
      restaurantId: crypto.randomUUID(),
      onNavigate: () => {},
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /원본/));
    await click(view.container, "수정");
    await fill(view.container, "name", "내 입력");
    version = 2;
    menu.name = "다른 탭 수정";
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert.match(view.container.textContent!, /다른 탭 수정/),
    );
    await submit(view.container);
    assert.equal(
      submittedVersion,
      undefined,
      "background refetch must not grant a stale form the newest version",
    );
    assert.match(view.container.textContent!, /내 입력으로 다시 적용/);
    await click(view.container, "내 입력으로 다시 적용");
    await submit(view.container);
    await until(() => assert.equal(submittedVersion, 2));
    await until(() =>
      assert.match(view.container.textContent!, /내 입력으로 다시 적용/),
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[name="name"]')!
        .value,
      "내 입력",
    );
  } finally {
    await view.unmount();
  }
});

test("draft autosave recovers a lost success response and uses the saved version on the next edit", async () => {
  let stored: RestaurantDraft = {
    id: crypto.randomUUID(),
    restaurantId: null,
    version: 1,
    data: emptyRegistration(),
    step: 0,
    selectedAddress: null,
    verifiedPhone: null,
    submitted: false,
  };
  const versions: number[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      versions.push(body.version);
      assert.equal(body.version, stored.version);
      stored = {
        ...stored,
        version: stored.version + 1,
        data: body.data,
        step: body.step,
      };
      if (versions.length === 1) throw new TypeError("response lost");
    }
    return structuredClone(stored) as T;
  };
  const view = await render(
    createElement(OwnerRegistration, {
      account: merchantAccount,
      request,
      draft: structuredClone(stored),
      onNavigate: () => {},
    }),
  );
  try {
    await fill(view.container, "name", "응답 유실 후 유지");
    await until(() => assert.equal(stored.version, 2));
    await fill(view.container, "name", "이어서 수정");
    await until(() => assert.equal(stored.data.name, "이어서 수정"));
    assert.deepEqual(versions, [1, 2]);
    assert.doesNotMatch(
      view.container.textContent!,
      /초안을 저장하지 못했어요/,
    );
  } finally {
    await view.unmount();
  }
});

test("draft conflicts preserve local input and require review before adopting current draft and restaurant versions", async () => {
  const draft: RestaurantDraft = {
    id: crypto.randomUUID(),
    restaurantId: crypto.randomUUID(),
    version: 1,
    restaurantVersion: 1,
    data: emptyRegistration(),
    step: 0,
    selectedAddress: null,
    verifiedPhone: null,
    submitted: false,
  };
  const latest: RestaurantDraft = {
    ...draft,
    version: 3,
    data: { ...draft.data, name: "다른 탭의 초안" },
    currentRestaurant: {
      version: 8,
      published: true,
      data: { ...draft.data, name: "현재 매장" },
    },
  };
  const writes: Record<string, unknown>[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      writes.push(body);
      if (body.version !== latest.version)
        throw new ApiError("", 409, "RESTAURANT_VERSION_CONFLICT");
      return {
        ...latest,
        version: 4,
        restaurantVersion: 8,
        data: body.data,
      } as T;
    }
    return structuredClone(latest) as T;
  };
  const view = await render(
    createElement(OwnerRegistration, {
      account: merchantAccount,
      request,
      draft,
      onNavigate: () => {},
    }),
  );
  try {
    await fill(view.container, "name", "작성 중인 내 입력");
    await until(() =>
      assert.match(view.container.textContent!, /최신 정보 확인이 필요/),
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[name="name"]')!
        .value,
      "작성 중인 내 입력",
    );
    assert.equal(writes.length, 1);
    await click(view.container, "최신 내용 확인 후 내 입력으로 이어가기");
    await until(() => assert.equal(writes.length, 2));
    assert.equal(writes[1].version, 3);
    assert.equal(writes[1].restaurantVersion, 8);
    assert.equal(
      (writes[1].data as { name: string }).name,
      "작성 중인 내 입력",
    );
  } finally {
    await view.unmount();
  }
});

test("owner next saves one draft version and unchanged mount/step does not autosave", async () => {
  let stored: RestaurantDraft = {
    id: crypto.randomUUID(),
    restaurantId: null,
    version: 1,
    data: {
      ...emptyRegistration(),
      name: "한 번 저장",
      addressQuery: "서울 테스트길 1",
      phone: merchantAccount.phone!,
    },
    step: 0,
    selectedAddress: {
      id: crypto.randomUUID(),
      query: "서울 테스트길 1",
      baseAddress: "서울 테스트길 1",
      roadAddress: "서울 테스트길 1",
      jibunAddress: "",
      latitude: 37.5,
      longitude: 127,
      region: "서울",
      source: "fake",
    },
    verifiedPhone: merchantAccount.phone!,
    submitted: false,
  };
  const writes: { version: number; step: number; advance: boolean }[] = [];
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (path.endsWith("/context"))
      return { restaurants: [], drafts: [], supportEmail: null } as T;
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      writes.push(body);
      stored = {
        ...stored,
        data: body.data,
        step: body.step,
        version: stored.version + 1,
      };
    }
    return structuredClone(stored) as T;
  };
  const view = await render(
    createElement(OwnerRegistration, {
      account: merchantAccount,
      request,
      draft: structuredClone(stored),
      onNavigate() {},
    }),
  );
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    assert.equal(writes.length, 0);
    await click(view.container, "다음");
    await until(() => assert.equal(stored.step, 1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].advance, true);
    assert.equal(writes[0].version, 1);
  } finally {
    await view.unmount();
  }
});

function emptyRegistration(): RegistrationData {
  return {
    name: "",
    branchName: "",
    addressQuery: "",
    detailAddress: "",
    category: "한식",
    phone: "",
    receiveConsent: false,
    maxCapacity: null,
    minimumGuests: { kind: "UNKNOWN", value: null },
    spaces: [],
    policies: {
      hours: null,
      holidays: { kind: "UNKNOWN", weekdays: [], note: "" },
      advance: { kind: "UNKNOWN", days: null },
      minimumOrder: { kind: "UNKNOWN", amount: null, quantity: null, unit: "" },
      menuDeadline: { kind: "UNKNOWN", value: null },
      guestDeadline: { kind: "UNKNOWN", value: null },
      usage: { kind: "UNKNOWN", minutes: null },
      deposit: { kind: "UNKNOWN", amount: null },
    },
  };
}
