// Shared Deploy/Rollback transport. Only AWS credentials for ECR/SSM exist here.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function commandFor({
  operation,
  sha,
  image,
  release,
  instance,
  account,
  repository,
}) {
  if (
    !/^[a-f0-9]{40}$/.test(sha ?? "") ||
    !/^i-[a-f0-9]{17}$/.test(instance ?? "") ||
    !/^[0-9]{12}$/.test(account ?? "") ||
    !/^[a-z0-9][a-z0-9._/-]*$/.test(repository ?? "")
  )
    throw new Error("Invalid deployment identity.");
  if (operation === "rollback") {
    if (!/^[a-zA-Z0-9_-]+$/.test(release ?? ""))
      throw new Error("Invalid release ID.");
    return `set -eu\nbash /opt/chongmuya/deployment/releases/${release}/deploy.sh rollback ${release} --confirm-compatibility`;
  }
  const prefix = `${account}.dkr.ecr.ap-northeast-2.amazonaws.com/${repository}@sha256:`;
  if (
    operation !== "deploy" ||
    !image?.startsWith(prefix) ||
    !/^[a-f0-9]{64}$/.test(image.slice(prefix.length))
  )
    throw new Error("Invalid immutable image.");
  // All interpolated values above are allowlisted. No runtime secrets enter SSM.
  return `set -eu
bundle=$(mktemp -d /tmp/chongmuya-deploy.XXXXXX)
trap 'rm -rf "$bundle"' EXIT
curl --fail --location --silent --show-error --connect-timeout 10 --max-time 120 https://github.com/chongmuya/chongmuya/archive/${sha}.tar.gz -o "$bundle/source.tar.gz"
tar -xzf "$bundle/source.tar.gz" --strip-components=1 -C "$bundle" chongmuya-${sha}/infra/deploy.sh chongmuya-${sha}/infra/compose.prod.yml chongmuya-${sha}/infra/compose.tools.yml
printf '%s\\n' '${sha}' > "$bundle/infra/source-sha"
bash "$bundle/infra/deploy.sh" deploy '${image}'`;
}

async function aws(args) {
  try {
    const result = await exec(
      "aws",
      [
        "--region",
        "ap-northeast-2",
        "--cli-connect-timeout",
        "10",
        "--cli-read-timeout",
        "25",
        ...args,
        "--output",
        "json",
      ],
      {
        env: { ...process.env, AWS_PAGER: "", AWS_MAX_ATTEMPTS: "1" },
        timeout: 40_000,
        maxBuffer: 1024 * 1024,
      },
    );
    return JSON.parse(result.stdout);
  } catch (error) {
    // Never forward provider stderr or command arguments to Actions logs.
    const code = /\(([A-Za-z][A-Za-z0-9]+)\) when calling/.exec(
      error.stderr ?? "",
    )?.[1];
    const safe = new Error(
      code ? `AWS ${code}` : "AWS request failed or timed out.",
    );
    safe.code = code;
    throw safe;
  }
}

export async function runOperation(input, dependencies = {}) {
  const io = {
    aws,
    sleep,
    now: Date.now,
    fetch,
    pollMs: 5000,
    limitMs: 25 * 60_000,
    ...dependencies,
  };
  const result = {
    operation: input.operation,
    commit:
      input.operation === "deploy" ? input.sha : "read from retained release",
    image: input.image || "read from retained release",
    release: input.release || "",
    instance: input.instance,
    command: "not sent",
    stage: "input",
    internal: "not checked",
    external: "not checked",
  };
  let directory;
  try {
    const command = commandFor(input);
    directory = await mkdtemp(join(tmpdir(), "chongmuya-ssm-"));
    const path = join(directory, "command.json");
    await writeFile(
      path,
      JSON.stringify({
        DocumentName: "AWS-RunShellScript",
        InstanceIds: [input.instance],
        TimeoutSeconds: 60,
        Comment: `chongmuya ${input.operation} ${input.sha}`,
        Parameters: { commands: [command], executionTimeout: ["1200"] },
      }),
      { mode: 0o600 },
    );
    result.stage = "send-command";
    const sent = await io.aws([
      "ssm",
      "send-command",
      "--cli-input-json",
      `file://${path}`,
    ]);
    const id = sent.Command?.CommandId;
    if (!/^[a-f0-9-]{36}$/.test(id ?? ""))
      throw new Error(
        "No valid command ID returned. Check SSM before repeating the operation.",
      );
    result.command = id;
    result.stage = "ssm-wait";
    const deadline = io.now() + io.limitMs;
    let invocation;
    while (io.now() < deadline) {
      try {
        invocation = await io.aws([
          "ssm",
          "get-command-invocation",
          "--command-id",
          id,
          "--instance-id",
          input.instance,
        ]);
      } catch (error) {
        if (
          ![
            "InvocationDoesNotExist",
            "ThrottlingException",
            "InternalServerError",
          ].includes(error.code)
        )
          throw new Error(
            "SSM result query failed. The server command may still be running; inspect its status and host lock before retrying.",
          );
        await io.sleep(io.pollMs);
        continue;
      }
      if (
        invocation.CommandId !== id ||
        invocation.InstanceId !== input.instance
      )
        throw new Error("Unexpected command invocation identity.");
      const output = invocation.StandardOutputContent ?? "";
      // Only explicit non-secret host protocol fields are copied to the summary.
      for (const line of output.split("\n")) {
        if (/^STAGE=[a-z-]+$/.test(line)) result.stage = line.slice(6);
        if (/^SOURCE_SHA=[a-f0-9]{40}$/.test(line))
          result.commit = line.slice(11);
        if (
          /^IMAGE=[0-9]{12}\.dkr\.ecr\.ap-northeast-2\.amazonaws\.com\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(
            line,
          )
        )
          result.image = line.slice(6);
        if (/^RELEASE_ID=[a-zA-Z0-9_-]+$/.test(line))
          result.release = line.slice(11);
      }
      if (["Pending", "InProgress", "Delayed"].includes(invocation.Status)) {
        await io.sleep(io.pollMs);
        continue;
      }
      if (invocation.Status !== "Success" || invocation.ResponseCode !== 0) {
        const status = [
          "Failed",
          "TimedOut",
          "Cancelled",
          "Cancelling",
          "Success",
        ].includes(invocation.Status)
          ? invocation.Status
          : "Unknown";
        result.internal = `${status} (exit ${Number.isInteger(invocation.ResponseCode) ? invocation.ResponseCode : "unknown"})`;
        // Migration diagnostics are JSON with allowlisted codes, never raw SQL/errors.
        for (const line of (invocation.StandardErrorContent ?? "").split(
          "\n",
        )) {
          try {
            const error = JSON.parse(line);
            if (
              error.phase === "migration" &&
              /^[A-Z0-9_]{1,40}$/.test(error.code ?? "")
            ) {
              result.internal += ` code=${error.code}`;
              if (/^[A-Za-z][A-Za-z0-9]{0,120}$/.test(error.migration ?? ""))
                result.internal += ` migration=${error.migration}`;
            }
          } catch {
            /* Non-protocol stderr is intentionally not copied. */
          }
        }
        throw new Error(
          "SSM operation failed. Inspect command status and host lock before retrying; no automatic rollback.",
        );
      }
      if (!output.includes("RESULT=SUCCESS internal-ready=200"))
        throw new Error(
          "SSM returned zero without an internal readiness result.",
        );
      result.internal = "ready (200), expected image verified";
      break;
    }
    if (!result.internal.startsWith("ready"))
      throw new Error(
        "SSM polling timed out. The server command may still be running; inspect its status and host lock before another deployment.",
      );
    result.stage = "external-ready";
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const response = await io.fetch("https://api.chongmuya.com/ready", {
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        await response.body?.cancel();
        if (response.status === 200) {
          result.external = "ready (200)";
          result.stage = "complete";
          return result;
        }
      } catch {
        /* bounded HTTPS retry; never retry the server deployment */
      }
      if (attempt < 5) await io.sleep(10000);
    }
    result.external =
      "failed; internal deployment succeeded, no automatic rollback";
    throw new Error(
      "External HTTPS readiness failed. Check DNS/Nginx/TLS separately.",
    );
  } catch (error) {
    if (result.stage === "send-command")
      result.internal = "submission uncertain; inspect SSM before retrying";
    error.result = result;
    throw error;
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let result;
  try {
    result = await runOperation({
      operation: process.env.OPERATION,
      sha: process.env.SOURCE_SHA,
      image: process.env.API_IMAGE,
      release: process.env.RELEASE_ID,
      instance: process.env.EC2_INSTANCE_ID,
      account: process.env.AWS_ACCOUNT_ID,
      repository: process.env.ECR_REPOSITORY,
    });
  } catch (error) {
    result = error.result;
    console.error(error.message);
    process.exitCode = 1;
  }
  if (result) {
    const summary = Object.entries(result)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### API ${result.operation}\n\n\`\`\`text\n${summary}\n\`\`\`\n`,
      );
  }
}
