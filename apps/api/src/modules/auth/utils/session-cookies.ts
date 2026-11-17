import type { Response } from "express";
import { cookieNames } from "./auth-cookies.js";
import {
  ACCESS_SECONDS,
  type SessionIssuerService,
} from "../session-issuer.service.js";
const options = (production: boolean) => ({
  httpOnly: true,
  secure: production,
  sameSite: "lax" as const,
  path: "/",
});
export function clearSessionCookies(response: Response, production: boolean) {
  const names = cookieNames(production);
  response.clearCookie(names.access, options(production));
  response.clearCookie(names.refresh, options(production));
}
export function sendSessionCookies(
  response: Response,
  result: Awaited<ReturnType<SessionIssuerService["createSession"]>>,
  production: boolean,
) {
  const names = cookieNames(production);
  response.cookie(names.access, result.access, {
    ...options(production),
    maxAge: ACCESS_SECONDS * 1000,
  });
  if (result.refresh)
    response.cookie(names.refresh, result.refresh, {
      ...options(production),
      expires: result.expiresAt,
    });
  return { authenticated: true, account: result.account };
}
