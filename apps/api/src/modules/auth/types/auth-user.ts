// Identity verified by Passport; resource permissions belong to the owning service.
import type { publicAccount } from "../utils/public-account.js";
export type AuthUser = ReturnType<typeof publicAccount>;
