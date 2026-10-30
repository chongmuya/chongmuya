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
  assert.equal(client.getSnapshot().status, "unavailable");
  fail = false;
  await client.logout();
  assert.equal(client.getSnapshot().status, "anonymous");
});
