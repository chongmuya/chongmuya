// Explicit operations entrypoint; production scheduling remains an operator action.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { RemindersService } from "../dist/modules/calendar/reminders.service.js";
if (process.argv.slice(2).join(" ") !== "--execute") {
  console.log(
    "Usage: pnpm calendar:reminders --execute (writes due inbox reminders; no SMS)",
  );
} else {
  process.env.REMINDERS_ENABLED = "false";
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const result = await app.get(RemindersService).run();
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}
