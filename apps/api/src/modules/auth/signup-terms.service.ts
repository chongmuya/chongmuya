import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import type { SignupConsentDto } from "./dto/request/signup.request.dto.js";
import {
  signupTerms as catalog,
  signupTermsVersion,
} from "./utils/signup-terms.js";

@Injectable()
export class SignupTermsService {
  constructor(private readonly config: ConfigService) {}
  get() {
    const { signupTerms: configured, webOrigin } = this.config.environment;
    return {
      terms: catalog.map(({ anchor, ...item }) => {
        const term = configured?.find((entry) => entry.id === item.id);
        return {
          ...item,
          version: term?.version ?? signupTermsVersion,
          url:
            term?.url ??
            new URL(`/legal/${signupTermsVersion}#${anchor}`, webOrigin).href,
          body: [],
          draft: false,
        };
      }),
    };
  }
  validate(consents: SignupConsentDto[]) {
    // Old tabs may still send a consent for this read-only document.
    const submitted = consents.filter((entry) => entry.id !== "privacyPolicy");
    const current = this.get().terms.filter(
      (term) => term.id !== "privacyPolicy",
    );
    if (
      submitted.length !== current.length ||
      new Set(submitted.map((entry) => entry.id)).size !== current.length
    )
      throw new DomainHttpException("SIGNUP_TERMS_CHANGED");
    for (const term of current) {
      const consent = submitted.find((entry) => entry.id === term.id);
      if (!consent || consent.version !== term.version)
        throw new DomainHttpException("SIGNUP_TERMS_CHANGED");
      if (term.required && !consent.accepted)
        throw new DomainHttpException("VALIDATION_FAILED", [
          { field: "consents", code: "INVALID_VALUE" },
        ]);
    }
    return submitted;
  }
}
