export type FileRecord = {
  id: string;
  eventId: string;
  expenseId: string | null;
  name: string;
  mime: string;
  size: number;
  status:
    "UPLOADING" | "READY" | "FAILED" | "DELETING" | "DELETE_FAILED" | "DELETED";
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type FileAccess = {
  accountId: string;
  eventId: string;
  request: import("@/features/auth/types").SessionRequest;
};
