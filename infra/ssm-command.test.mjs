import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { commandFor, runOperation } from "./ssm-command.mjs";
const id = "11111111-1111-1111-1111-111111111111";
const input = {
  operation: "deploy",
  sha: "a".repeat(40),
  image: `524947030343.dkr.ecr.ap-northeast-2.amazonaws.com/chongmuya-api@sha256:${"b".repeat(64)}`,
  account: "524947030343",
  repository: "chongmuya-api",
  instance: "i-0ee46962de2a3321a",
};
const output = `SOURCE_SHA=${input.sha}\nIMAGE=${input.image}\nRELEASE_ID=20261119-test\nSTAGE=record\nRESULT=SUCCESS internal-ready=200`;
function fake(states, fetch = async () => ({ status: 200 })) {
  let time = 0;
  const calls = [];
  return {
    calls,
    sleep: async (ms) => {
      time += ms;
    },
    now: () => time,
    pollMs: 10,
    limitMs: 100,
    fetch,
    aws: async (args) => {
      calls.push(args);
      if (args[1] === "send-command") {
        const body = JSON.parse(await readFile(args.at(-1).slice(7), "utf8"));
        assert.deepEqual(body.InstanceIds, [input.instance]);
        assert.equal(body.Parameters.executionTimeout[0], "1200");
        return { Command: { CommandId: id } };
      }
      const state = states.length > 1 ? states.shift() : states[0];
      if (state === "InvocationDoesNotExist")
        throw Object.assign(new Error(), { code: state });
      return {
        CommandId: id,
        InstanceId: input.instance,
        ResponseCode: 0,
        StandardOutputContent: output,
        ...state,
      };
    },
  };
}
test("SSM validates inputs, waits through eventual visibility and checks the selected invocation", async () => {
  for (const change of [
    { sha: "main" },
    { instance: "i-1;false" },
    { image: input.image + ";false" },
    { operation: "rollback", release: "../current" },
  ])
    assert.throws(() => commandFor({ ...input, ...change }));
  const io = fake([
    "InvocationDoesNotExist",
    { Status: "Pending" },
    { Status: "InProgress" },
    { Status: "Success" },
  ]);
  const result = await runOperation(input, io);
  assert.equal(result.stage, "complete");
  assert.equal(result.release, "20261119-test");
  assert.equal(io.calls.filter((a) => a[1] === "send-command").length, 1);
  const rollback = commandFor({
    ...input,
    operation: "rollback",
    release: result.release,
  });
  assert.match(rollback, /releases\/20261119-test\/deploy.sh rollback/);
  assert.doesNotMatch(rollback, /curl|migration|seed|build|push/);
});
test("SSM failures, nonzero success and polling timeout never become successful deploys", async () => {
  for (const state of [
    { Status: "Failed", ResponseCode: 1 },
    { Status: "Success", ResponseCode: 5 },
    { Status: "TimedOut", ResponseCode: -1 },
  ])
    await assert.rejects(
      runOperation(input, fake([state])),
      (error) =>
        error.result.stage === "record" &&
        error.result.internal.includes("exit"),
    );
  await assert.rejects(
    runOperation(input, fake([{ Status: "InProgress" }])),
    /may still be running/,
  );
  await assert.rejects(
    runOperation(
      input,
      fake([{ Status: "Success", InstanceId: "i-00000000000000000" }]),
    ),
    /identity/,
  );
  await assert.rejects(
    runOperation(
      input,
      fake([{ Status: "Success", StandardOutputContent: "" }]),
    ),
    /without an internal readiness/,
  );
});
test("migration diagnostics are allowlisted and HTTPS failure preserves internal success without resending", async () => {
  const io = fake([
    {
      Status: "Failed",
      ResponseCode: 1,
      StandardErrorContent:
        'NEVER_LOG_SECRET\n{"phase":"migration","code":"42501","migration":"InitialSchema123"}',
    },
  ]);
  await assert.rejects(
    runOperation(input, io),
    (error) =>
      /42501.*InitialSchema123/.test(error.result.internal) &&
      !JSON.stringify(error.result).includes("NEVER_LOG_SECRET"),
  );
  let requests = 0;
  const external = fake([{ Status: "Success" }], async () => {
    requests++;
    return { status: 502 };
  });
  await assert.rejects(
    runOperation(input, external),
    (error) =>
      error.result.internal.startsWith("ready") &&
      error.result.external.startsWith("failed"),
  );
  assert.equal(requests, 6);
  assert.equal(external.calls.filter((a) => a[1] === "send-command").length, 1);
});

test("deployment gate admits only the verified main SHA, including workflow_run", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "deployment-gate-"));
  try {
    await writeFile(
      join(dir, "gh"),
      '#!/bin/sh\ncase "$*" in *compare*) echo "${TEST_RELATION:-ahead}";; *) echo "${TEST_CI:-success}";; esac\n',
      { mode: 0o755 },
    );
    const event = {
      workflow_run: {
        head_sha: input.sha,
        head_branch: "main",
        event: "push",
        conclusion: "success",
        head_repository: { full_name: "chongmuya/chongmuya" },
      },
    };
    const eventPath = join(dir, "event.json");
    await writeFile(eventPath, JSON.stringify(event));
    const gate = (extra = {}) =>
      spawnSync("bash", [resolve("infra/verify-main.sh")], {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          GITHUB_REPOSITORY: "chongmuya/chongmuya",
          GITHUB_REF: "refs/heads/main",
          TARGET_SHA: input.sha,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_EVENT_PATH: eventPath,
          ...extra,
        },
      }).status;
    assert.equal(gate(), 0);
    assert.equal(gate({ GITHUB_EVENT_NAME: "workflow_run" }), 0);
    for (const extra of [
      { GITHUB_REF: "refs/pull/1/merge" },
      { GITHUB_EVENT_NAME: "pull_request" },
      { TEST_CI: "failure" },
      { TEST_RELATION: "diverged" },
      { TARGET_SHA: "b".repeat(40), GITHUB_EVENT_NAME: "workflow_run" },
    ])
      assert.notEqual(gate(extra), 0);
    event.workflow_run.event = "pull_request";
    await writeFile(eventPath, JSON.stringify(event));
    assert.notEqual(gate({ GITHUB_EVENT_NAME: "workflow_run" }), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
