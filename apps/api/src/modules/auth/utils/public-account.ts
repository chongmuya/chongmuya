import type { Account } from "../entities/account.entity.js";
export const publicAccount = (account: Account) => ({
  id: account.id,
  accountType: account.accountType,
  email: account.email,
  name: account.name,
  nickname: account.nickname,
  phone: account.phone,
  phoneVerifiedAt: account.phoneVerifiedAt?.toISOString() ?? null,
  emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
});
