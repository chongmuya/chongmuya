// A customer-facing number is independent of the private inquiry recipient.
export const publicPhonePattern = /^(?:0\d{8,11}|1[568]\d{6})$/;
export const normalizePublicPhone = (value: string | null | undefined) =>
  value?.replace(/[ -]/g, "") || null;
export function validPublicPhone(value: string | null | undefined) {
  const normalized = normalizePublicPhone(value);
  return normalized === null || publicPhonePattern.test(normalized);
}
