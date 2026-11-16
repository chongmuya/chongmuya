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
    const configured = this.config.environment.signupTerms;
    return {
      terms: catalog.map((item) => {
        const term = configured?.find((entry) => entry.id === item.id);
        return {
          ...item,
          version: term?.version ?? signupTermsVersion,
          url: term?.url ?? null,
          body: term ? [] : [...item.body],
          draft: !term,
        };
      }),
    };
  }
  validate(consents: SignupConsentDto[]) {
    const current = this.get();
    if (
      new Set(consents.map((entry) => entry.id)).size !== catalog.length ||
      consents.length !== catalog.length
    )
      throw new DomainHttpException("SIGNUP_TERMS_CHANGED");
    for (const term of current.terms) {
      const consent = consents.find((entry) => entry.id === term.id);
      if (!consent || consent.version !== term.version)
        throw new DomainHttpException("SIGNUP_TERMS_CHANGED");
      if (term.required && !consent.accepted)
        throw new DomainHttpException("VALIDATION_FAILED", [
          { field: "consents", code: "INVALID_VALUE" },
        ]);
    }
  }
}
