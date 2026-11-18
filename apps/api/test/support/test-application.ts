import type { Request } from "express";
import "reflect-metadata";
import {
  Body,
  Controller,
  Get,
  Post,
  HttpException,
  Req,
} from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { IsInt, IsString, Min } from "class-validator";
import { AppModule } from "../../src/app.module.js";
import { ConfigService } from "../../src/config/config.service.js";
import { parseEnvironment } from "../../src/config/environment.js";
import { configureHttp } from "../../src/bootstrap/configure-http.js";
import type { RequestLog } from "../../src/common/http/request-context.js";

class ProbeDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

// Exercises global HTTP configuration without shipping example business endpoints.
@Controller("test")
class ProbeController {
  @Get("ip") ip(@Req() req: Request) {
    return { ip: req.ip };
  }
  @Post("validate")
  validate(@Body() body: ProbeDto) {
    return body;
  }

  @Get("error")
  error() {
    throw new Error("private-database-password");
  }

  @Get("limited")
  limited() {
    throw new HttpException("private-limit-details", 429);
  }

  @Get("secret/:token")
  secret() {
    return { ok: true };
  }
}

export async function startTestApplication(
  databaseUrl: string,
  docsEnabled = true,
  extraEnvironment: NodeJS.ProcessEnv = {},
) {
  const environment = parseEnvironment({
    RESEND_API_KEY: "re_test_only",
    RESEND_FROM: "Test <test@example.test>",
    EMAIL_VERIFICATION_SECRET: "test-email-secret-with-at-least-32-characters",
    AUTH_SECRET: "test-secret-with-at-least-32-characters",
    WEB_ORIGIN: "http://localhost:3000",
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    API_DOCS_ENABLED: String(docsEnabled),
    ...extraEnvironment,
  });
  const module = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController],
  })
    .overrideProvider(ConfigService)
    .useValue({ environment })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    logger: false,
    rawBody: true,
  });
  const logs: RequestLog[] = [];
  configureHttp(app, environment, (entry) => logs.push(entry));
  await app.listen(0, "127.0.0.1");
  return { app, url: await app.getUrl(), logs };
}
