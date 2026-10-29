import { BadRequestException, Logger, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { Environment } from "../config/environment.js";
import { HttpExceptionFilter } from "../common/http/http-exception.filter.js";
import { requestContext } from "../common/http/request-context.js";
import type { RequestLog } from "../common/http/request-context.js";

export function configureHttp(
  app: NestExpressApplication,
  environment: Environment,
  log: (entry: RequestLog) => void = (entry) =>
    new Logger("HTTP").log(JSON.stringify(entry)),
) {
  app.disable("x-powered-by");
  app.use(requestContext(log));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      exceptionFactory: () => new BadRequestException(),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  if (environment.docsEnabled) {
    const definition = new DocumentBuilder()
      .setTitle("총무야 API")
      .setDescription("기본 HTTP 계약. 인증 및 업무 API는 후속 구현입니다.")
      .setVersion("0.1.0")
      .build();
    SwaggerModule.setup(
      "docs",
      app,
      SwaggerModule.createDocument(app, definition),
      {
        jsonDocumentUrl: "docs-json",
        swaggerOptions: { persistAuthorization: false },
      },
    );
  }
}
