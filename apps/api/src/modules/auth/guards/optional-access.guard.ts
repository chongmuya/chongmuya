import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthError } from "../exceptions/auth.exception.js";

// Bootstrap allows anonymous/expired credentials but propagates infrastructure errors.
@Injectable()
export class OptionalAccessGuard extends AuthGuard("jwt-access") {
  handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
    if (error && !(error instanceof AuthError)) throw error;
    return (error ? false : user) as TUser;
  }
}
