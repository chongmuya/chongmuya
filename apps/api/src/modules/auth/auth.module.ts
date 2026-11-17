import { EmailVerificationService } from "./email-verification.service.js";
import { ResendMailService } from "./resend-mail.service.js";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../../database/database.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SignupController } from "./signup.controller.js";
import { PhoneVerificationService } from "./phone-verification.service.js";
import { OctomoService } from "./octomo.service.js";
import { SignupTermsService } from "./signup-terms.service.js";
import { AuthAttemptsRepository } from "./repositories/auth-attempts.repository.js";
import { CsrfGuard } from "./guards/csrf.guard.js";

import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { JwtAccessStrategy } from "./strategies/jwt-access.strategy.js";
import { AccessGuard } from "./guards/jwt-access.guard.js";
import { OptionalAccessGuard } from "./guards/optional-access.guard.js";

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PassportModule.register({ session: false }),
    JwtModule.register({}),
  ],
  controllers: [AuthController, SignupController],
  providers: [
    AuthService,
    PhoneVerificationService,
    EmailVerificationService,
    ResendMailService,
    OctomoService,
    SignupTermsService,
    AuthAttemptsRepository,
    JwtAccessStrategy,
    AccessGuard,
    OptionalAccessGuard,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AccessGuard, AuthService],
})
export class AuthModule {}
