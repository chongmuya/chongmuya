import { Injectable } from "@nestjs/common";
import * as oidc from "openid-client";
import { z } from "zod";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
export const KAKAO_ISSUER = "https://kauth.kakao.com";
const endpoints = {
  authorization_endpoint: `${KAKAO_ISSUER}/oauth/authorize`,
  token_endpoint: `${KAKAO_ISSUER}/oauth/token`,
  jwks_uri: `${KAKAO_ISSUER}/.well-known/jwks.json`,
  userinfo_endpoint: "https://kapi.kakao.com/v1/oidc/userinfo",
} as const;
const claimsSchema = z.looseObject({
  sub: z.string().min(1).max(255),
  iss: z.literal(KAKAO_ISSUER),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().min(1),
});
const userSchema = z.looseObject({
  sub: z.string().min(1).max(255),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
});
@Injectable()
export class KakaoOidcService {
  private configuration?: Promise<oidc.Configuration>;
  constructor(private readonly config: ConfigService) {}
  assertConfigured() {
    if (!this.config.environment.kakaoClientId)
      throw new DomainHttpException("KAKAO_UNAVAILABLE");
  }
  private getConfiguration() {
    this.assertConfigured();
    if (!this.configuration) {
      const env = this.config.environment;
      this.configuration = oidc
        .discovery(
          new URL(KAKAO_ISSUER),
          env.kakaoClientId!,
          { id_token_signed_response_alg: "RS256" },
          oidc.ClientSecretPost(env.kakaoClientSecret!),
          { timeout: 5, execute: [oidc.enableNonRepudiationChecks] },
        )
        .then((configuration) => {
          const metadata = configuration.serverMetadata();
          for (const [key, value] of Object.entries(endpoints))
            if (metadata[key] !== value)
              throw new DomainHttpException("KAKAO_INVALID");
          return configuration;
        })
        .catch((error: unknown) => {
          this.configuration = undefined;
          throw this.failure(error);
        });
    }
    return this.configuration;
  }
  private failure(error: unknown) {
    if (error instanceof DomainHttpException) return error;
    if (
      error instanceof oidc.ResponseBodyError &&
      ["invalid_scope", "invalid_client", "unauthorized_client"].includes(
        error.error,
      )
    )
      return new DomainHttpException("KAKAO_CONFIGURATION");
    if (
      error instanceof oidc.ResponseBodyError &&
      (error.status >= 500 ||
        error.status === 429 ||
        ["server_error", "temporarily_unavailable"].includes(error.error))
    )
      return new DomainHttpException("KAKAO_UNAVAILABLE");
    if (
      error instanceof TypeError ||
      (error instanceof oidc.ClientError &&
        [
          "OAUTH_TIMEOUT",
          "OAUTH_RESPONSE_IS_NOT_JSON",
          "OAUTH_RESPONSE_IS_NOT_CONFORM",
        ].includes(error.code ?? ""))
    )
      return new DomainHttpException("KAKAO_UNAVAILABLE");
    return new DomainHttpException("KAKAO_INVALID");
  }
  async authorization(state: string, nonce: string, verifier: string) {
    const configuration = await this.getConfiguration();
    return oidc
      .buildAuthorizationUrl(configuration, {
        redirect_uri: this.config.environment.kakaoRedirectUri!,
        scope: "openid account_email",
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
      })
      .toString();
  }
  async exchange(
    parameters: URLSearchParams,
    state: string,
    nonce: string,
    verifier: string,
  ) {
    const configuration = await this.getConfiguration();
    const callback = new URL(this.config.environment.kakaoRedirectUri!);
    callback.search = parameters.toString();
    try {
      // No retry of an authorization code. SDK verifies state, nonce, issuer, audience,
      // expiration, PKCE and (explicitly enabled above) JWS using cached/rotating JWKS.
      const tokens = await oidc.authorizationCodeGrant(
        configuration,
        callback,
        {
          expectedState: state,
          expectedNonce: nonce,
          pkceCodeVerifier: verifier,
          idTokenExpected: true,
        },
      );
      const claims = claimsSchema.parse(tokens.claims());
      const user = userSchema.parse(
        await oidc.fetchUserInfo(
          configuration,
          tokens.access_token,
          claims.sub,
        ),
      );
      const email = z
        .email()
        .max(254)
        .safeParse(user.email?.trim().toLowerCase());
      return {
        issuer: claims.iss,
        sub: claims.sub,
        email: email.success ? email.data : null,
        emailVerifiedAt:
          email.success && user.email_verified === true ? new Date() : null,
      };
    } catch (error) {
      throw this.failure(error);
    }
  }
}
