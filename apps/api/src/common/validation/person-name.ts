// Preserve internal spaces and spelling; all identity comparisons use the same normalization.
export const normalizePersonName = (name: string) =>
  name.trim().normalize("NFC");
export const personNamePattern =
  /^(?!.*01[016789][\s-]*\d{3,4}[\s-]*\d{4})(?=.*\p{L})[^\p{Cc}]+$/u;
