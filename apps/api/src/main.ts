import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { ConfigService } from "./config/config.service.js";
import { configureHttp } from "./bootstrap/configure-http.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const { environment } = app.get(ConfigService);
  configureHttp(app, environment);
  app.enableShutdownHooks();
  await app.listen(environment.port);
}

bootstrap().catch(() => {
  console.error("API startup failed. Check environment configuration and port availability.");
  process.exitCode = 1;
});
