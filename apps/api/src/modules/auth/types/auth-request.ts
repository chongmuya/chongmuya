import type { Request } from "express";
import type { AuthUser } from "./auth-user.js";

export type AuthRequest = Request & { user?: AuthUser | false };
