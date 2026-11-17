import { Injectable } from "@nestjs/common";
import { Resend } from "resend";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";

// Delivery only; authentication decides recipients, content, lifetime and consumption.
@Injectable()
export class ResendMailService {
  constructor(private readonly config: ConfigService) {}
  assertConfigured() {
    const env = this.config.environment;
    if (!env.resendApiKey || !env.resendFrom)
      throw new DomainHttpException("EMAIL_VERIFICATION_UNAVAILABLE");
  }
  async send(
    to: string,
    subject: string,
    text: string,
    deliveryId: string,
  ): Promise<void> {
    this.assertConfigured();
    const resend = new Resend(this.config.environment.resendApiKey, {
      baseUrl: "https://api.resend.com",
    });
    // Two bounded transport attempts reuse exactly the same payload and provider key.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await resend.emails.send(
          {
            from: this.config.environment.resendFrom!,
            to: [to],
            subject,
            text,
          },
          {
            idempotencyKey: deliveryId,
            signal: AbortSignal.timeout(4000),
          },
        );
        if (!result.error && result.data?.id) return;
        if (
          result.error?.statusCode &&
          result.error.statusCode < 500 &&
          ![409, 429].includes(result.error.statusCode)
        )
          break;
      } catch {
        /* Never expose provider input or error bodies. */
      }
    }
    throw new DomainHttpException("EMAIL_VERIFICATION_UNAVAILABLE");
  }
}
