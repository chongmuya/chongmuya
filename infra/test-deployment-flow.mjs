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
  const issuedReleases = new Set();
  t.after(() => {
    run("docker", [
      "rm",
      "-f",
      ...ok(
        run("docker", [
          "ps",
          "-aq",
          "--filter",
          `label=com.docker.compose.project=${name}`,
        ]),
      )
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    ]);
    if (existsSync(join(root, "releases")))
      for (const id of readdirSync(join(root, "releases")))
        issuedReleases.add(id);
    for (const release of issuedReleases)
      run("docker", ["image", "rm", `chongmuya-api-release:${release}`]);
    run("docker", ["image", "rm", runner, second, broken]);
  });
  copyFileSync(resolve("infra/deploy.sh"), join(bundle, "deploy.sh"));
  const configuration =
    readFileSync(resolve("infra/compose.prod.yml"), "utf8").replace(
      'ports:\n      - "127.0.0.1:3001:3001"',
      "ports: []",
    ) + `\nnetworks:\n  default:\n    external: true\n    name: ${name}\n`;
  writeFileSync(join(bundle, "compose.prod.yml"), configuration);
  writeFileSync(join(directory, "parameters.json"), JSON.stringify(payload));
  writeFileSync(join(directory, "policy.json"), "{}");
  writeFileSync(
    join(bin, "aws"),
    `#!/usr/local/bin/node
const fs=require('node:fs');
const dir=${JSON.stringify(directory)};
if(process.argv.includes('ecr')) process.stdout.write('test-login');
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
 const envFile=args[args.indexOf('--env-file')+1];
 if(args.includes('--env-file')){
   const reference=fs.readFileSync(envFile,'utf8').match(/^API_IMAGE=(.+)$/m)[1];
   env.API_IMAGE=mappings[reference];
 }
 if(args.includes('up')){
   rules.upCount=(rules.upCount??0)+1;fs.writeFileSync(dir+'/policy.json',JSON.stringify(rules));
   if(rules.failRecovery && rules.upCount===2)process.exit(32);
   args[args.indexOf('--wait-timeout')+1]='12';
 }
 if(args.includes('migrate') && rules.newMigration){
   process.stdout.write(JSON.stringify({phase:'after',appliedCount:1})+'\\n');process.exit(0);
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
      ...extra,
      ...(extra.length ? [] : [join(bundle, "deploy.sh"), ...args]),
    ]);
    if (existsSync(join(root, "releases")))
      for (const id of readdirSync(join(root, "releases")))
        issuedReleases.add(id);
    return result;
  };
  const current = () => readlinkSync(join(root, "current"));
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
  const journal = () =>
    readdirSync(join(root, "releases"))
      .map((id) => readFileSync(join(root, "releases", id, "journal"), "utf8"))
      .join("\n");

  assert.notEqual(
    invoke(["rollback", "missing", "--confirm-compatibility"]).status,
    0,
  );
  ok(publish(sha, digest("a")));
  const first = current();
  assert.match(readFileSync(join(first, "journal"), "utf8"), /BEFORE absent/);
  const firstId = first.split("/").at(-1);
  ok(publish(sha2, digest("b")));
  const secondRelease = current();
  assert.notEqual(
    readFileSync(join(first, "image-id"), "utf8"),
    readFileSync(join(secondRelease, "image-id"), "utf8"),
  );
  // Lock is real Linux flock; all three commands must reject concurrent work.
  ok(
    invoke(
      [],
      [
        "-c",
        `flock '${root}/deploy.lock' bash -c 'for args in "deploy ${digest("a")}" "rollback ${firstId}" "seed-restaurants"; do if bash ${bundle}/deploy.sh $args; then exit 1; fi; done'`,
      ],
    ),
  );
  for (const stage of ["pull", "configuration", "migration"]) {
    policy({ pullFailure: stage === "pull" });
    configure(
      stage === "configuration"
        ? { AUTH_SECRET: "invalid" }
        : stage === "migration"
          ? {
              DATABASE_URL: payload.Parameters.find((p) =>
                p.Name.endsWith("/DATABASE_URL"),
              ).Value.replace("local-test-only", "wrong-password"),
            }
          : {},
    );
    assert.notEqual(publish(sha, digest("a")).status, 0);
    assert.equal(current(), secondRelease);
    assert.equal(readlinkSync(join(root, "previous")), first);
  }
  configure();
  policy();
  // No new migrations: real unhealthy replacement, exactly one recovery to B.
  assert.notEqual(publish(sha3, digest("c")).status, 0);
  assert.match(journal(), /RECOVERY_SUCCEEDED/);
  assert.equal(
    JSON.parse(readFileSync(join(directory, "policy.json"))).upCount,
    2,
  );
  assert.equal(current(), secondRelease);
  // Failure injection in the recovery command leaves an unhealthy API; no loop.
  policy({ failRecovery: true });
  assert.notEqual(publish(sha3, digest("c")).status, 0);
  assert.match(journal(), /RECOVERY_FAILED/);
  assert.equal(
    JSON.parse(readFileSync(join(directory, "policy.json"))).upCount,
    2,
  );
  policy();
  assert.notEqual(
    invoke(["rollback", firstId]).status,
    0,
    "manual schema/config review is required",
  );
  configure({ AUTH_SECRET: "rotated-current-test-secret-with-32-characters" });
  const start = commands().length;
  ok(invoke(["rollback", firstId, "--confirm-compatibility"]));
  const rolledBack = current();
  assert.equal(
    readFileSync(join(rolledBack, "image-id"), "utf8"),
    readFileSync(join(first, "image-id"), "utf8"),
  );
  assert.match(
    readFileSync(join(rolledBack, "api.env"), "utf8"),
    /rotated-current-test-secret/,
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
  // Remove the API, then recover using the known release without a running app.
  const api = ok(
    run("docker", [
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${name}`,
      "--filter",
      "label=com.docker.compose.service=api",
    ]),
  ).trim();
  ok(run("docker", ["rm", "-f", api]));
  ok(
    invoke([
      "rollback",
      secondRelease.split("/").at(-1),
      "--confirm-compatibility",
    ]),
  );
  assert.match(
    readFileSync(join(current(), "journal"), "utf8"),
    /BEFORE absent/,
  );
  // Simulate a successful new migration report: failure must stay manual.
  policy({ newMigration: true });
  assert.notEqual(publish(sha3, digest("c")).status, 0);
  assert.equal(
    JSON.parse(readFileSync(join(directory, "policy.json"))).upCount,
    1,
  );
  policy();
  ok(invoke(["rollback", firstId, "--confirm-compatibility"]));
  const seedStart = commands().length;
  ok(invoke(["seed-restaurants"]));
  assert(
    commands()
      .slice(seedStart)
      .some((args) => args.includes("seed-restaurants")),
  );
}
