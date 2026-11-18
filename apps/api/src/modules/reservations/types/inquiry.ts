export type InquiryConditions = {
  startsAt: string;
  expectedGuests: number;
  region: string;
  seating: "CLOSE" | "SEPARATED" | "ANY";
  space: "HALL" | "FLOOR" | "WHOLE" | "ANY";
  seatingImportance: "REQUIRED" | "PREFERRED" | null;
  spaceImportance: "REQUIRED" | "PREFERRED" | null;
  budgetBasis: "PER_PERSON" | "TOTAL" | null;
  budgetAmount: number | null;
  alcohol: "INCLUDED" | "EXCLUDED" | "UNKNOWN" | null;
  additionalRequests: string | null;
};
export type InquirySnapshot = InquiryConditions & {
  eventName: string;
  groupName: string | null;
  groupType: string | null;
};
