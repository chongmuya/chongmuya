import "reflect-metadata";
import { NestFactory } from "@nestjs/core";

export async function createOperationsApplication() {
  // Process-local only, before AppModule evaluation and ConfigService construction.
  // dotenv respects this value even when the API environment enables reminders.
  process.env.REMINDERS_ENABLED = "false";
  const { AppModule } = await import("../dist/app.module.js");
  return NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
}
