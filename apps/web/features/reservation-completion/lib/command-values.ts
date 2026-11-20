import { fromKoreanDateInput } from "@/shared/lib/korean-date";
export { koreanDateInput as localDate } from "@/shared/lib/korean-date";
export const isoDate = (value: string) => {
  const result = fromKoreanDateInput(value);
  if (!result) throw new RangeError("INVALID_DATE");
  return result;
};
