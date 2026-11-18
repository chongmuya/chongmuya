import "reflect-metadata";
import { open, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { DataSource } from "typeorm";
import { localDatabaseEnvironmentSchema } from "../../config/database-environment.js";
import { linkEnvironmentFields } from "../../config/link-environment.js";
import { databaseOptions } from "../database-options.js";
import { merchantEncryptionKey } from "../../modules/reservations/lib/merchant-link-codec.js";
import { passwordPattern } from "../../modules/auth/utils/password.js";
import { seedDemo, DemoSeedConflict } from "./demo.seed.js";
import { demoLinks } from "./demo-links.seed.js";

export const demoEnvironmentSchema = localDatabaseEnvironmentSchema.and(
  z
    .object({
      ...linkEnvironmentFields,
      MESSAGE_PROVIDER: z.literal("fake").default("fake"),
    })
    .refine((e) => !!e.AUTH_SECRET || !!e.MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY, {
      path: ["MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY"],
    })
    .refine(
      (e) => {
        try {
          return ["localhost", "127.0.0.1", "[::1]"].includes(
            new URL(e.WEB_ORIGIN).hostname,
          );
        } catch {
          return false;
        }
      },
      { path: ["WEB_ORIGIN"] },
    ),
);

async function run() {
  config({ quiet: true });
  const [command, ...args] = process.argv.slice(2);
  if (!["seed", "links"].includes(command ?? ""))
    throw new DemoSeedConflict("INVALID_COMMAND");
  const parsed = demoEnvironmentSchema.safeParse(process.env);
  if (!parsed.success)
    throw new DemoSeedConflict(
      `INVALID_ENVIRONMENT:${[...new Set(parsed.error.issues.map((i) => i.path[0]))].join(",")}`,
    );
  const env = parsed.data;
  let set = "default",
    output: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1]) throw new DemoSeedConflict("INVALID_ARGUMENTS");
    if (args[i] === "--set" && command === "seed") set = args[i + 1]!;
    else if (args[i] === "--output") output = args[i + 1];
    else throw new DemoSeedConflict("INVALID_ARGUMENTS");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(set))
    throw new DemoSeedConflict("INVALID_SET_KEY");
  // This CLI already rejects production, remote databases and real messaging.
  const password = process.env.DEMO_SEED_PASSWORD ?? "Demo1234!";
  if (command === "seed" && !passwordPattern.test(password))
    throw new DemoSeedConflict("INVALID_ENVIRONMENT:DEMO_SEED_PASSWORD");
  const path = resolve(
    output ?? `../../.local/demo-${command}-${set}-${Date.now()}.links.json`,
  );
  if (!path.endsWith(".links.json"))
    throw new DemoSeedConflict("OUTPUT_MUST_END_WITH_LINKS_JSON");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Reserve a new file before any DB mutation. Never overwrite or follow an existing link.
  const file = await open(path, "wx", 0o600);
  const db = new DataSource(databaseOptions({ databaseUrl: env.DATABASE_URL }));
  try {
    await db.initialize();
    if (await db.showMigrations())
      throw new DemoSeedConflict("MIGRATIONS_REQUIRED");
    const key = merchantEncryptionKey({
      nodeEnv: env.NODE_ENV,
      authSecret: env.AUTH_SECRET,
      merchantReplyTokenEncryptionKey: env.MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY,
    });
    const result =
      command === "seed"
        ? await seedDemo(db, { password, set, encryptionKey: key })
        : null;
    const links = await demoLinks(db, env.WEB_ORIGIN, key);
    await file.writeFile(JSON.stringify(links, null, 2) + "\n");
    if (result) console.log(JSON.stringify(result, null, 2));
    console.log(`로컬 링크 파일 (0600): ${path}`);
    console.log(
      `참석 링크 ${links.attendance.length}개, 현재 유효한 가상 매장 답변 링크 ${links.merchantReplies.length}개. 실제 문자 발송 없음.`,
    );
  } finally {
    await file.close();
    if (db.isInitialized) await db.destroy();
  }
}
run().catch((error: unknown) => {
  console.error(
    error instanceof DemoSeedConflict
      ? error.code
      : "DEMO_FAILED: 로컬 DB·migration·새 출력 경로·암호화 설정을 확인하세요. 원문 오류는 출력하지 않습니다.",
  );
  process.exitCode = 1;
});
