import type { Request, Response } from "express";
import { Logger, ValidationPipe } from "@nestjs/common";
import { validationException } from "../common/http/domain-http.exception.js";
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
  app.set(
    "trust proxy",
    environment.trustedProxyCidrs.length
      ? environment.trustedProxyCidrs
      : false,
  );
  app.use(requestContext(log));
  app.enableCors({
    origin: (origin, callback) =>
      callback(null, origin === environment.webOrigin),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Protection", "X-Merchant-Access"],
    exposedHeaders: ["x-request-id"],
    optionsSuccessStatus: 204,
  });
  // Up to 500 roster names plus optional last-four digits, including UTF-8 text.
  app.useBodyParser("json", { limit: "256kb" });
  app.use((req: Request, res: Response, next: () => void) => {
    if (
      req.path.startsWith("/api/v1/merchant-replies/") ||
      req.path.startsWith("/api/v1/owner/")
    ) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      exceptionFactory: validationException,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  if (environment.docsEnabled) {
    const definition = new DocumentBuilder()
      .setTitle("총무야 API")
      .setDescription(
        "인증 API /api/v1/auth. 변경 요청은 Origin 및 X-CSRF-Protection: 1 필수.",
      )
      .setVersion("0.2.0")
      .addCookieAuth(
        environment.nodeEnv === "production" ? "__Host-access" : "access",
      )
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
