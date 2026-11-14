import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../../database/database.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./auth.repository.js";
import { CsrfGuard } from "./auth-http.js";

import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { JwtAccessStrategy } from "./jwt-access.strategy.js";
import { AccessGuard, OptionalAccessGuard } from "./jwt-access.guard.js";

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PassportModule.register({ session: false }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    JwtAccessStrategy,
    AccessGuard,
    OptionalAccessGuard,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AccessGuard, AuthService],
})
export class AuthModule {}
