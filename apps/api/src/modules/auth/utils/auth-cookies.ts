import type { Request } from "express";

export const signupCookieName = (production: boolean) =>
  production ? "__Host-signup-requester" : "signup-requester";

export function cookie(request: Request, name: string): string | undefined {
  const matches = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}
export function cookieNames(production: boolean) {
  return {
    access: production ? "__Host-access" : "access",
    refresh: production ? "__Host-refresh" : "refresh",
  };
}

export const kakaoCookieName = (production: boolean) =>
  production ? "__Host-kakao-browser" : "kakao-browser";
