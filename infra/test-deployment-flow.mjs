// Linux orchestration against real Docker/Compose; AWS/ECR I/O is replaced locally.
import assert from "node:assert/strict";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";

export async function verifyDeploymentFlow({
  directory,
  name,
  certificate,
  image,
  payload,
  migrationPayload,
  restaurantId,
  run,
  ok,
  t,
}) {
  const root = join(directory, "deploy");
  const bundle = join(directory, "bundle");
  const bin = join(directory, "bin");
  for (const path of [root, bundle, bin]) mkdirSync(path);
  const runner = `${name}-runner`;
  const second = `${name}-second`;
  const broken = `${name}-broken`;
  const sha = ok(
    run("docker", [
      "image",
      "inspect",
      "-f",
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      image,
    ]),
  ).trim();
  const sha2 = "2".repeat(40);
  const sha3 = "3".repeat(40);
  const digest = (letter) =>
    `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/api@sha256:${letter.repeat(64)}`;
  const images = {
    [digest("a")]: image,
    [digest("b")]: second,
    [digest("c")]: broken,
  };
  writeFileSync(
    join(directory, "Runnerfile"),
    `FROM docker:29-cli AS cli\nFROM ${image}\nUSER root\nCOPY --from=cli /usr/local/bin/docker /usr/local/bin/docker-real\nCOPY --from=cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins\n`,
  );
  ok(
    run("docker", [
      "build",
      "--platform",
      "linux/amd64",
      "-f",
      join(directory, "Runnerfile"),
      "-t",
      runner,
      directory,
    ]),
  );
  for (const [tag, revision, command] of [
    [second, sha2, ""],
    [broken, sha3, 'CMD ["node","-e","setInterval(()=>{},1000)"]'],
  ]) {
    writeFileSync(
      join(directory, "Variantfile"),
      `FROM ${image}\nLABEL org.opencontainers.image.revision=${revision}\n${command}\n`,
    );
    ok(
      run("docker", [
        "build",
        "--platform",
        "linux/amd64",
        "-f",
        join(directory, "Variantfile"),
        "-t",
        tag,
        directory,
      ]),
    );
  }
  t.after(() => {
    const ids = ok(
      run("docker", [
        "ps",
        "-aq",
        "--filter",
        `label=com.docker.compose.project=${name}`,
      ]),
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (ids.length) run("docker", ["rm", "-f", ...ids]);
    run("docker", ["image", "rm", runner, second, broken]);
  });
  copyFileSync(resolve("infra/deploy.sh"), join(bundle, "deploy.sh"));
  const configuration =
    readFileSync(resolve("infra/compose.prod.yml"), "utf8").replace(
      'ports:\n      - "127.0.0.1:3001:3001"',
      "ports: []",
    ) + `\nnetworks:\n  default:\n    external: true\n    name: ${name}\n`;
  writeFileSync(join(bundle, "compose.prod.yml"), configuration);
  writeFileSync(
    join(bundle, "compose.tools.yml"),
    readFileSync(resolve("infra/compose.tools.yml"), "utf8") +
      `\nnetworks:\n  default:\n    external: true\n    name: ${name}\n`,
  );
  writeFileSync(join(directory, "parameters.json"), JSON.stringify(payload));
  writeFileSync(
    join(directory, "migration.json"),
    JSON.stringify(migrationPayload),
  );
  writeFileSync(join(directory, "policy.json"), "{}");
  writeFileSync(
    join(bin, "aws"),
    `#!/usr/local/bin/node
const fs=require('node:fs');
const dir=${JSON.stringify(directory)};
if(process.argv.includes('ecr')) process.stdout.write('test-login');
else if(process.argv.includes('/chongmuya/deploy/prod/DATABASE_URL')) process.stdout.write(fs.readFileSync(dir+'/migration.json'));
else if(process.argv.includes('get-parameter')) process.stdout.write(JSON.stringify({Parameter:JSON.parse(fs.readFileSync(dir+'/parameters.json')).Parameters.find(p=>p.Name.endsWith('/DATABASE_URL'))}));
else process.stdout.write(fs.readFileSync(dir+'/parameters.json'));
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "docker"),
    `#!/usr/local/bin/node
const fs=require('node:fs');const cp=require('node:child_process');
const dir=${JSON.stringify(directory)};const mappings=${JSON.stringify(images)};
const args=process.argv.slice(2);const rules=JSON.parse(fs.readFileSync(dir+'/policy.json'));
fs.appendFileSync(dir+'/commands.log',JSON.stringify(args)+'\\n');
if(args[0]==='login'){process.stdin.resume();return;}
if(args[0]==='pull'){
 if(rules.pullFailure)process.exit(31);
 const reference=mappings[args.at(-1)];
 process.exit(cp.spawnSync('/usr/local/bin/docker-real',['image','inspect',reference],{stdio:'ignore'}).status??1);
}
const env={...process.env};
if(args[0]==='compose'){
 if(env.API_IMAGE)env.API_IMAGE=mappings[env.API_IMAGE];
 if(args.includes('up')){
   rules.upCount=(rules.upCount??0)+1;fs.writeFileSync(dir+'/policy.json',JSON.stringify(rules));
   args[args.indexOf('--wait-timeout')+1]='12';
 }

}
const mapped=args.map(arg=>mappings[arg]??(arg==='chongmuya'?${JSON.stringify(name)}:arg.replace('label=com.docker.compose.project=chongmuya','label=com.docker.compose.project='+${JSON.stringify(name)})));
const result=cp.spawnSync('/usr/local/bin/docker-real',mapped,{env,stdio:'inherit'});process.exit(result.status??1);
`,
    { mode: 0o755 },
  );

  const invoke = (args, extra = []) => {
    const result = run("docker", [
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      "--user",
      "0",
      "-v",
      "/var/run/docker.sock:/var/run/docker.sock",
      "-v",
      `${directory}:${directory}`,
      "-e",
      `PATH=${bin}:/usr/local/bin:/usr/bin:/bin`,
      "-e",
      `DEPLOY_ROOT=${root}`,
      "-e",
      `RDS_CA_FILE=${certificate}`,
      runner,
      "bash",
      "-c",
      // SSM runs as root. Keep that behavior inside the runner, then return
      // only this test's files to the host account without relaxing 0600.
      'test_owner=$1; test_root=$2; shift 2; trap \'chown -R "$test_owner" "$test_root"\' EXIT; bash "$@"',
      "deployment-test",
      `${process.getuid()}:${process.getgid()}`,
      directory,
      ...extra,
      ...(extra.length ? [] : [join(bundle, "deploy.sh"), ...args]),
    ]);
    const state = join(root, "deployment");
    if (existsSync(state)) {
      assert(
        !readdirSync(state).some((p) => p.startsWith(".work-")),
        "temporary secrets cleaned after every command",
      );
      assert(readdirSync(join(state, "releases")).length <= 3);
    }
    return result;
  };
  const current = () => readlinkSync(join(root, "deployment/current"));
  const commands = () =>
    readFileSync(join(directory, "commands.log"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
  const policy = (value = {}) =>
    writeFileSync(join(directory, "policy.json"), JSON.stringify(value));
  const configure = (values = {}) => {
    const copy = structuredClone(payload);
    for (const [key, value] of Object.entries(values))
      copy.Parameters.find((p) => p.Name.endsWith("/" + key)).Value = value;
    writeFileSync(join(directory, "parameters.json"), JSON.stringify(copy));
  };
  const publish = (revision, reference) => {
    writeFileSync(join(bundle, "source-sha"), revision);
    return invoke(["deploy", reference]);
  };
  // #32 legacy data remains untouched by the new bounded record format.
  mkdirSync(join(root, "releases/legacy"), { recursive: true });
  writeFileSync(join(root, "releases/legacy/api.env"), "legacy-value");
  assert.notEqual(
    invoke(["rollback", "missing", "--confirm-compatibility"]).status,
    0,
  );
  ok(publish(sha, digest("a")));
  const first = current();
  const firstId = first.split("/").at(-1);
  ok(publish(sha2, digest("b")));
  const secondRelease = current();
  const apiId = () =>
    ok(
      run("docker", [
        "ps",
        "-aq",
        "--filter",
        `label=com.docker.compose.project=${name}`,
        "--filter",
        "label=com.docker.compose.service=api",
      ]),
    ).trim();
  const stableContainer = apiId();
  ok(
    invoke(
      [],
      [
        "-c",
        `flock '${root}/deploy.lock' bash -c 'for args in "deploy ${digest("a")}" "rollback ${firstId} --confirm-compatibility" "seed-restaurants"; do if bash ${bundle}/deploy.sh $args; then exit 1; fi; done'`,
      ],
    ),
  );
  for (const stage of ["pull", "configuration", "migration"]) {
    policy({ pullFailure: stage === "pull" });
    configure(
      stage === "configuration" ? { AUTH_SECRET: "DO_NOT_LOG_THIS" } : {},
    );
    const migration = structuredClone(migrationPayload);
    if (stage === "migration")
      migration.Parameter.Value = migration.Parameter.Value.replace(
        "migrator-test-only",
        "NEVER_LOG_PASSWORD",
      );
    writeFileSync(join(directory, "migration.json"), JSON.stringify(migration));
    const failure = publish(sha, digest("a"));
    assert.notEqual(failure.status, 0);
    assert.doesNotMatch(
      failure.stdout + failure.stderr,
      /DO_NOT_LOG_THIS|NEVER_LOG_PASSWORD|postgresql:/,
    );
    if (stage === "migration") assert.match(failure.stderr, /28P01/);
    assert.equal(
      apiId(),
      stableContainer,
      "pre-replacement failure preserves running API",
    );
    assert.equal(current(), secondRelease);
  }
  configure();
  writeFileSync(
    join(directory, "migration.json"),
    JSON.stringify(migrationPayload),
  );
  policy();
  assert.notEqual(publish(sha3, digest("c")).status, 0);
  assert.equal(
    JSON.parse(readFileSync(join(directory, "policy.json"))).upCount,
    1,
    "no automatic rollback",
  );
  assert.equal(current(), secondRelease);
  assert.equal(readlinkSync(join(root, "deployment/previous")), first);
  assert.notEqual(
    invoke(["rollback", firstId]).status,
    0,
    "operator confirmation required",
  );
  configure({ AUTH_SECRET: "rotated-current-test-secret-with-32-characters" });
  const start = commands().length;
  ok(invoke(["rollback", firstId, "--confirm-compatibility"]));
  assert.match(
    readFileSync(join(root, "deployment/runtime/api.env"), "utf8"),
    /rotated-current-test-secret/,
  );
  assert.doesNotMatch(
    readFileSync(join(root, "deployment/runtime/api.env"), "utf8"),
    /chongmuya_migrator|migrator-test-only/,
  );
  assert(
    !commands()
      .slice(start)
      .some(
        (args) =>
          args.includes("migrate") ||
          args.includes("seed-restaurants") ||
          args.includes("build"),
      ),
  );
  assert.equal(
    ok(
      run("docker", ["inspect", "-f", "{{.Config.Labels}}", apiId()]),
    ).includes(sha),
    true,
  );
  ok(run("docker", ["rm", "-f", apiId()]));
  ok(
    invoke([
      "rollback",
      secondRelease.split("/").at(-1),
      "--confirm-compatibility",
    ]),
  );
  ok(invoke(["seed-restaurants"]));
  ok(invoke(["operations", "--help"]));
  const contactFile = join(directory, "operator-contact.json");
  writeFileSync(
    contactFile,
    JSON.stringify({
      id: "00000000-0000-4000-8000-000000000099",
      name: "테스트 담당자",
      phone: "01000000001",
      requestConsentAt: "2026-01-01T00:00:00Z",
      consentNote: "NEVER_LOG_CONSENT",
    }),
    { mode: 0o600 },
  );
  // The original is root:root/0600 in the Linux runner, just like an SSM file.
  // Inspect it before the test-only cleanup returns files to the host account.
  const operatorRun = invoke(
    [],
    [
      "-c",
      `
set -euo pipefail
file=$1; script=$2; restaurant=$3
chown 0:0 "$file"
chmod 600 "$file"
before=$(sha256sum "$file")
OPERATOR_INPUT_FILE="$file" bash "$script" operations --action record-contact --restaurant "$restaurant" --input /run/input.json --actor deployment-test --reason dry-run-fixture
[[ $(stat -c '%u:%g:%a' "$file") == 0:0:600 && $(sha256sum "$file") == "$before" ]]
chmod 644 "$file"
if OPERATOR_INPUT_FILE="$file" bash "$script" operations --action record-contact --restaurant "$restaurant" --input /run/input.json --actor deployment-test --reason dry-run-fixture; then exit 1; fi
[[ $(stat -c '%u:%g:%a' "$file") == 0:0:644 && $(sha256sum "$file") == "$before" ]]
`,
      "operator-file-test",
      contactFile,
      join(bundle, "deploy.sh"),
      restaurantId,
    ],
  );
  assert.match(ok(operatorRun), /record-contact: 변경 전 확인/);
  assert.match(operatorRun.stderr, /Private operator input rejected/);
  assert.doesNotMatch(
    operatorRun.stdout + operatorRun.stderr,
    /01000000001|NEVER_LOG_CONSENT/,
  );
  assert.equal(
    readFileSync(join(root, "releases/legacy/api.env"), "utf8"),
    "legacy-value",
  );
  for (const id of readdirSync(join(root, "deployment/releases"))) {
    assert(!existsSync(join(root, "deployment/releases", id, "api.env")));
    assert(!existsSync(join(root, "deployment/releases", id, "db.env")));
  }
}
