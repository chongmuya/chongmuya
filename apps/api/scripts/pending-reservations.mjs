import "reflect-metadata";
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { MessageDeliveryService } from "../dist/modules/reservations/message-delivery.service.js";

config({ quiet: true });
let app;
try {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3) throw new Error();
  app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  const targets = await app.get(MessageDeliveryService).pendingForOperations();
  // Personal data belongs in an explicit operator-owned file, never application logs.
  await writeFile(
    output,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), ...targets },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    `연락처 확인 완료 ${targets.eligible.length}건, 보류 ${targets.held.length}건을 권한 0600의 새 파일에 기록했습니다. 발송하거나 상태를 바꾸지 않았습니다. 실제 처리는 merchant:operations의 delivery ID 명령을 사용하세요.`,
  );
} catch {
  console.error(
    "조회하지 못했습니다. 새 출력 파일 경로와 서버·DB 설정을 확인하세요.",
  );
  process.exitCode = 1;
} finally {
  await app?.close();
}
