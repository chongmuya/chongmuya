import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../shared/http/api-error";
import { SessionClient } from "../features/auth/session";
import type { Session } from "../features/auth/session";
import type { requestJson } from "../shared/http/request";
const session: Session = {
  authenticated: true,
  account: { id: "a", email: "a@example.com" },
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
      account: { id: "b", email: "b@example.com" },
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
    account: { id: "b", email: "b@example.com" },
  };
  await client.restore();
  rejectRequest(expired());
  await rejected;
  assert.equal(probes, 0);
  assert.equal(client.getSnapshot().account?.id, "b");
});
