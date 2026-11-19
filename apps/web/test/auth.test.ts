import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../shared/http/api-error";
import { SessionClient } from "../features/auth/lib/session-client";
import type { Session } from "../features/auth/types/auth.types";
import type { requestJson } from "../shared/http/request";
const session: Session = {
  authenticated: true,
  account: {
    accountType: null,
    name: null,
    nickname: null,
    phone: null,
    phoneVerifiedAt: null,
    emailVerifiedAt: null,
    id: "a",
    email: "a@example.com",
  },
};
const expired = () => new ApiError("", 401, "ACCESS_EXPIRED");
const invalid = () => new ApiError("", 401, "SESSION_INVALID");
const network = () => new ApiError("", 0, "NETWORK_ERROR");
function transport(handler: (path: string) => Promise<unknown>) {
  return handler as typeof requestJson;
}

test("anonymous bootstrap is deduplicated without clearing public/user caches", async () => {
  let calls = 0;
  let clears = 0;
  const client = new SessionClient(
    () => clears++,
    transport(async () => {
      calls++;
      return { authenticated: false, account: null };
    }),
  );
  await Promise.all([client.restore(), client.restore()]);
  assert.equal(calls, 1);
  assert.equal(clears, 0);
  assert.equal(client.getSnapshot().status, "anonymous");
});
test("simultaneous expiry shares refresh and retries each request only once", async () => {
  let refreshes = 0;
  let ready = false;
  let calls = 0;
  const client = new SessionClient(
    () => {},
    transport(async (path) => {
      if (path.endsWith("/refresh")) {
        refreshes++;
        ready = true;
        return session;
      }
      if (path.endsWith("/me")) throw expired();
      calls++;
      if (!ready) throw expired();
      return "ok";
    }),
  );
  assert.deepEqual(
    await Promise.all([
      client.request("/api/v1/resource"),
      client.request("/api/v1/resource"),
    ]),
    ["ok", "ok"],
  );
  assert.equal(refreshes, 1);
  assert.equal(calls, 4);
});
test("retry failure never loops; temporary refresh errors preserve identity", async () => {
  let mode = "restore";
  let clears = 0;
  let refreshes = 0;
  const client = new SessionClient(
    () => clears++,
    transport(async (path) => {
      if (path.endsWith("restore")) return session;
      if (path.endsWith("refresh")) {
        refreshes++;
        if (mode === "network") throw network();
        return session;
      }
      throw expired();
    }),
  );
  await client.restore();
  mode = "network";
  await assert.rejects(client.request("/api/v1/resource"));
  assert.equal(client.getSnapshot().account?.id, "a");
  assert.equal(clears, 0);
  mode = "expired";
  await assert.rejects(client.request("/api/v1/resource"));
  assert.equal(refreshes, 2);
});
test("invalid session clears user cache; bootstrap outage stays unknown", async () => {
  let clears = 0;
  const client = new SessionClient(
    () => clears++,
    transport(async () => {
      throw invalid();
    }),
  );
  await assert.rejects(client.request("/api/v1/resource"));
  assert.equal(clears, 1);
  const offline = new SessionClient(
    () => clears++,
    transport(async () => {
      throw network();
    }),
  );
  await assert.rejects(offline.restore());
  assert.equal(offline.getSnapshot().status, "unavailable");
  assert.equal(clears, 1);
});
test("logout waits for refresh and prevents request retry/session resurrection", async () => {
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>((r) => {
    started = r;
  });
  const order: string[] = [];
  const client = new SessionClient(
    () => {},
    transport(async (path) => {
      if (path.endsWith("refresh")) {
        started();
        await new Promise<void>((r) => {
          release = r;
        });
        order.push("refresh");
        return session;
      }
      if (path.endsWith("logout")) {
        order.push("logout");
        return;
      }
      throw expired();
    }),
  );
  const request = client.request("/api/v1/resource");
  const rejected = assert.rejects(request);
  await began;
  const logout = client.logout();
  release();
  await logout;
  await rejected;
  assert.deepEqual(order, ["refresh", "logout"]);
  assert.equal(client.getSnapshot().status, "anonymous");
});
test("failed logout remains blocked until logout retry succeeds", async () => {
  let fail = true;
  const client = new SessionClient(
    () => {},
    transport(async () => {
      if (fail) throw network();
    }),
  );
  await assert.rejects(client.logout());
  await assert.rejects(client.request("/api/v1/resource"));
  await client.restore();
  assert.equal(client.getSnapshot().status, "logout-failed");
  fail = false;
  await client.logout();
  assert.equal(client.getSnapshot().status, "anonymous");
});

for (const source of ["me", "refresh"] as const) {
  test(`account switch from ${source} clears user cache and cancels all old-account retries`, async () => {
    const other: Session = {
      authenticated: true,
      account: {
        accountType: null,
        name: null,
        nickname: null,
        phone: null,
        phoneVerifiedAt: null,
        emailVerifiedAt: null,
        id: "b",
        email: "b@example.com",
      },
    };
    let clears = 0;
    let mutations = 0;
    let refreshes = 0;
    let switched = false;
    const client = new SessionClient(
      () => clears++,
      transport(async (path) => {
        if (path.endsWith("restore")) return session;
        if (path.endsWith("/me")) {
          if (source === "refresh") throw expired();
          switched = true;
          return other.account;
        }
        if (path.endsWith("/refresh")) {
          refreshes++;
          switched = true;
          return other;
        }
        mutations++;
        if (!switched) throw expired();
        return "must not replay an old account's mutation";
      }),
    );
    await client.restore();
    const results = await Promise.allSettled([
      client.request("/api/v1/resource", { method: "POST" }),
      client.request("/api/v1/resource", { method: "POST" }),
    ]);
    assert(results.every((result) => result.status === "rejected"));
    assert.equal(mutations, 2, "neither old-account mutation is retried");
    assert.equal(clears, 1);
    assert.equal(refreshes, source === "refresh" ? 1 : 0);
    assert.deepEqual(client.getSnapshot(), {
      status: "authenticated",
      account: other.account,
    });
  });
}

test("same account found by me after another tab refreshes still retries once", async () => {
  let calls = 0;
  let clears = 0;
  const client = new SessionClient(
    () => clears++,
    transport(async (path) => {
      if (path.endsWith("restore")) return session;
      if (path.endsWith("/me")) return session.account;
      if (++calls === 1) throw expired();
      return "ok";
    }),
  );
  await client.restore();
  assert.equal(await client.request("/api/v1/resource"), "ok");
  assert.equal(calls, 2);
  assert.equal(clears, 0);
});

test("ordinary restore outage can recover without logging out", async () => {
  let offline = true;
  const client = new SessionClient(
    () => {},
    transport(async () => {
      if (offline) throw network();
      return session;
    }),
  );
  await assert.rejects(client.restore());
  assert.equal(client.getSnapshot().status, "unavailable");
  offline = false;
  await client.restore();
  assert.deepEqual(client.getSnapshot(), {
    status: "authenticated",
    account: session.account,
  });
});

for (const source of ["me", "refresh"] as const) {
  test(`late ${source} response cannot restore identity after logout starts`, async () => {
    let release!: (value: unknown) => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    let mutations = 0;
    let refreshes = 0;
    const snapshots: string[] = [];
    const client = new SessionClient(
      () => {},
      transport(async (path) => {
        if (path.endsWith("restore")) return session;
        if (path.endsWith("logout")) return;
        if (path.endsWith("/me") && source === "refresh") throw expired();
        if (path.endsWith(`/${source}`)) {
          if (source === "refresh") refreshes++;
          started();
          return new Promise((resolve) => {
            release = resolve;
          });
        }
        mutations++;
        throw expired();
      }),
    );
    await client.restore();
    const rejected = assert.rejects(
      client.request("/api/v1/resource", { method: "POST" }),
    );
    await began;
    client.subscribe(() => snapshots.push(client.getSnapshot().status));
    const logout = client.logout();
    release(source === "me" ? session.account : session);
    await logout;
    await rejected;
    assert.deepEqual(snapshots, ["logging-out", "anonymous"]);
    assert.equal(mutations, 1);
    assert.equal(refreshes, source === "refresh" ? 1 : 0);
  });
}

test("late expiry from an old account neither starts refresh nor replays the request", async () => {
  let rejectRequest!: (reason: unknown) => void;
  let current = session;
  let probes = 0;
  const client = new SessionClient(
    () => {},
    transport(async (path) => {
      if (path.endsWith("restore")) return current;
      if (path.endsWith("/me") || path.endsWith("/refresh")) {
        probes++;
        return current;
      }
      return new Promise((_, reject) => {
        rejectRequest = reject;
      });
    }),
  );
  await client.restore();
  const rejected = assert.rejects(client.request("/api/v1/resource"));
  current = {
    authenticated: true,
    account: {
      accountType: null,
      name: null,
      nickname: null,
      phone: null,
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
      id: "b",
      email: "b@example.com",
    },
  };
  await client.restore();
  rejectRequest(expired());
  await rejected;
  assert.equal(probes, 0);
  assert.equal(client.getSnapshot().account?.id, "b");
});

for (const transition of ["account switch", "logout"] as const) {
  test(`a successful late event write is rejected after ${transition}`, async () => {
    let release!: (value: unknown) => void;
    let current = session;
    let clears = 0;
    const client = new SessionClient(
      () => clears++,
      transport(async (path) => {
        if (path.endsWith("restore")) return current;
        if (path.endsWith("logout")) return;
        return new Promise((resolve) => {
          release = resolve;
        });
      }),
    );
    await client.restore();
    const rejected = assert.rejects(
      client.request("/api/v1/events/e1", { method: "PATCH" }),
      (error: unknown) =>
        error instanceof ApiError && error.code === "SESSION_INVALID",
    );
    if (transition === "logout") await client.logout();
    else {
      current = {
        authenticated: true,
        account: {
          accountType: null,
          name: null,
          nickname: null,
          phone: null,
          phoneVerifiedAt: null,
          emailVerifiedAt: null,
          id: "b",
          email: "b@example.com",
        },
      };
      await client.restore();
    }
    release({ id: "e1", ownerId: "a", groupId: "g1", version: 2 });
    await rejected;
    assert.equal(clears, 1);
    assert.equal(
      client.getSnapshot().account?.id,
      transition === "logout" ? undefined : "b",
    );
  });
}

test("first setup applies the current profile but ignores writes after exit, logout or account switch", async () => {
  for (const ending of ["none", "exit", "logout", "switch"] as const) {
    let release!: (value: unknown) => void;
    let remote = session;
    const client = new SessionClient(
      () => {},
      transport(async (path) => {
        if (path.endsWith("first-setup"))
          return new Promise((resolve) => {
            release = resolve;
          });
        if (path.endsWith("logout")) return undefined;
        return remote;
      }),
    );
    await client.restore();
    const controller = new AbortController();
    const saving = client.saveFirstSetup(
      { accountType: "owner" },
      controller.signal,
    );
    const result = saving.then(
      () => true,
      () => false,
    );
    if (ending === "exit") controller.abort();
    if (ending === "logout") await client.logout();
    if (ending === "switch") {
      remote = { ...session, account: { ...session.account!, id: "other" } };
      await client.restore();
    }
    release({ ...session.account, accountType: "owner" });
    assert.equal(await result, ending === "none");
    assert.equal(
      client.getSnapshot().account?.accountType,
      ending === "none" ? "owner" : ending === "logout" ? undefined : null,
    );
    if (ending === "switch")
      assert.equal(client.getSnapshot().account?.id, "other");
  }
});

test("simultaneous email and phone preparation shares one signup requester initialization", async () => {
  let calls = 0;
  let release!: () => void;
  const client = new SessionClient(
    () => {},
    transport(async (path) => {
      assert(path.endsWith("/signup/context"));
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }),
  );
  const email = client.prepareSignup(),
    phone = client.prepareSignup();
  assert.equal(calls, 1);
  release();
  await Promise.all([email, phone]);
});

for (const lookup of ["restore", "me", "refresh"] as const) {
  test(`first setup wins over an older same-account ${lookup} response without invalidating requests`, async () => {
    let bootstrapped = false;
    let release!: (value: unknown) => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    let reads = 0;
    let clears = 0;
    const updated = {
      ...session.account!,
      accountType: "organizer" as const,
      nickname: "새 닉네임",
    };
    const client = new SessionClient(
      () => {
        clears++;
      },
      transport(async (path) => {
        if (path.endsWith("/first-setup")) return updated;
        if (path.endsWith("/restore") && !bootstrapped) {
          bootstrapped = true;
          return session;
        }
        if (path.endsWith("/events")) {
          if (++reads === 1) throw expired();
          return "events";
        }
        if (lookup === "refresh" && path.endsWith("/me")) throw expired();
        assert(path.endsWith(`/${lookup}`));
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      }),
    );
    await client.restore();
    const oldRead =
      lookup === "restore"
        ? client.restore()
        : client.request("/api/v1/events");
    await began;
    await client.saveFirstSetup(
      { accountType: "organizer", nickname: updated.nickname },
      new AbortController().signal,
    );
    assert.deepEqual(client.getSnapshot().account, updated);
    release(lookup === "me" ? session.account : session);
    assert.equal(await oldRead, lookup === "restore" ? undefined : "events");
    assert.deepEqual(client.getSnapshot(), {
      status: "authenticated",
      account: updated,
    });
    assert.equal(clears, 0);
    if (lookup !== "restore")
      assert.equal(reads, 2, "normal refresh still retries once");
  });
}

test("profile saves do not hide session revocation, another account or newer profile reads", async () => {
  for (const result of ["anonymous", "other", "fresh"] as const) {
    let bootstrapped = false;
    let release!: (value: unknown) => void;
    let clears = 0;
    const updated = { ...session.account!, accountType: "owner" as const };
    const client = new SessionClient(
      () => {
        clears++;
      },
      transport(async (path) => {
        if (path.endsWith("first-setup")) return updated;
        if (!bootstrapped) {
          bootstrapped = true;
          return session;
        }
        return new Promise((resolve) => {
          release = resolve;
        });
      }),
    );
    await client.restore();
    const oldRead = result !== "fresh" ? client.restore() : undefined;
    await client.saveFirstSetup(
      { accountType: "owner" },
      new AbortController().signal,
    );
    const read = oldRead ?? client.restore();
    const next: Session =
      result === "anonymous"
        ? { authenticated: false, account: null }
        : {
            authenticated: true,
            account: {
              ...updated,
              id: result === "other" ? "b" : updated.id,
              name: "최신 이름",
            },
          };
    release(next);
    await read;
    assert.deepEqual(client.getSnapshot().account, next.account);
    assert.equal(
      client.getSnapshot().status,
      next.authenticated ? "authenticated" : "anonymous",
    );
    assert.equal(clears, result === "fresh" ? 0 : 1);
  }
});

test("profile and verified phone responses merge only their own fields in either completion order", async () => {
  for (const order of [
    ["phone", "profile"],
    ["profile", "phone"],
  ] as const) {
    const client = new SessionClient(
      () => {},
      transport(async () => session),
    );
    await client.restore();
    const profile = {
      ...session.account!,
      name: "바뀐 이름",
      nickname: "바뀐 닉네임",
    };
    const phone = {
      ...session.account!,
      phone: "01000009991",
      phoneVerifiedAt: "2030-01-01T00:00:00Z",
    };
    for (const endpoint of order)
      client.applyProfile(endpoint === "profile" ? profile : phone, endpoint);
    assert.equal(client.getSnapshot().account?.name, profile.name);
    assert.equal(client.getSnapshot().account?.nickname, profile.nickname);
    assert.equal(client.getSnapshot().account?.phone, phone.phone);
    assert.equal(
      client.getSnapshot().account?.phoneVerifiedAt,
      phone.phoneVerifiedAt,
    );
    client.applyProfile({ ...profile, id: "another-account" }, "profile");
    assert.equal(client.getSnapshot().account?.id, "a");
    await client.logout();
    client.applyProfile(profile, "profile");
    assert.equal(client.getSnapshot().account, null);
  }
});

test("only scoped authority loss invalidates matching resources and rejects late responses", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise<unknown>((r) => (resolve = r));
  let cleared = 0;
  const scopes: string[][] = [];
  const client = new SessionClient(
    () => cleared++,
    transport(async (path) => {
      if (path.includes("restore")) return session;
      if (path === "/api/v1/events/old") return pending;
      if (path === "/api/v1/events/known")
        return { id: "old", groupId: "group" };
      if (path === "/api/v1/groups/group")
        throw new ApiError("", 404, "GROUP_AUTHORITY_CHANGED");
      if (path === "/api/v1/events/personal") return { name: "preserved" };
      throw new ApiError("", 404, "RESOURCE_NOT_FOUND");
    }),
    async (action) => action(),
    (_account, ids) => scopes.push(ids),
  );
  await client.restore();
  await client.request("/api/v1/events/known");
  const late = client.request("/api/v1/events/old");
  await assert.rejects(client.request("/api/v1/calendar/deleted"));
  await assert.rejects(
    client.request("/api/v1/groups/invitations/wrong/preview"),
  );
  assert.equal(scopes.length, 0);
  await assert.rejects(client.request("/api/v1/groups/group"));
  resolve({ privateRoster: ["must not return"] });
  await assert.rejects(
    late,
    (e: unknown) => e instanceof ApiError && e.code === "GROUP_AUTHORITY_STALE",
  );
  assert.equal(cleared, 0);
  assert(scopes[0]!.includes("old"));
  assert.deepEqual(await client.request("/api/v1/events/personal"), {
    name: "preserved",
  });
  assert.equal(client.getSnapshot().status, "authenticated");
  const groupId = crypto.randomUUID();
  client.receiveAuthorityChange({
    source: "other",
    accountId: "different",
    groupId,
  });
  client.receiveAuthorityChange({
    source: client.instanceId,
    accountId: session.account!.id,
    groupId,
  });
  assert.equal(scopes.length, 1);
  client.receiveAuthorityChange({
    source: "other",
    accountId: session.account!.id,
    groupId,
  });
  assert.equal(scopes.length, 2);
});

test("late authority denial from a previous account does not invalidate the current account", async () => {
  let reject!: (error: unknown) => void;
  const pending = new Promise((_resolve, r) => (reject = r));
  let current = session,
    scoped = 0;
  const client = new SessionClient(
    () => undefined,
    transport(async (path) => {
      if (path.includes("restore")) return current;
      return pending;
    }),
    async (action) => action(),
    () => scoped++,
  );
  await client.restore();
  const old = client.request("/api/v1/events/old");
  current = { ...session, account: { ...session.account!, id: "b" } };
  await client.restore();
  reject(new ApiError("", 404, "GROUP_AUTHORITY_CHANGED"));
  await assert.rejects(old);
  assert.equal(scoped, 0);
  assert.equal(client.getSnapshot().account?.id, "b");
});
