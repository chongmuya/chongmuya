import type { SessionRequest } from "@/features/auth/types";
import type { Group } from "../types/group.types";
import type { GroupInput } from "../schemas/group.schema";

export const getGroups = (request: SessionRequest, signal?: AbortSignal) =>
  request<Group[]>("/api/v1/groups", { signal });
export const createGroup = (request: SessionRequest, input: GroupInput) =>
  request<Group>("/api/v1/groups", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const renameGroup = (
  request: SessionRequest,
  id: string,
  input: GroupInput,
) =>
  request<Group>(`/api/v1/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
