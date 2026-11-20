import type { SessionRequest } from "@/features/auth/types";
import type {
  Group,
  GroupMember,
  CreateGroupInput,
  AddGroupMembersInput,
  AddedGroupMembers,
  MemberHistory,
} from "../types/group.types";
import type { GroupInput } from "../schemas/group.schema";

export const getGroups = (request: SessionRequest, signal?: AbortSignal) =>
  request<Group[]>("/api/v1/groups", { signal });
export const createGroup = (request: SessionRequest, input: CreateGroupInput) =>
  request<Group>("/api/v1/groups", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const getGroupMembers = (
  request: SessionRequest,
  id: string,
  signal?: AbortSignal,
) =>
  request<GroupMember[]>(`/api/v1/groups/${encodeURIComponent(id)}/members`, {
    signal,
  });
export const renameGroup = (
  request: SessionRequest,
  id: string,
  input: GroupInput,
) =>
  request<Group>(`/api/v1/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...input,
      groupType: input.groupType === "" ? null : input.groupType,
    }),
  });

export const addGroupMembers = (
  request: SessionRequest,
  id: string,
  input: AddGroupMembersInput,
) =>
  request<AddedGroupMembers>(
    `/api/v1/groups/${encodeURIComponent(id)}/members`,
    { method: "POST", body: JSON.stringify(input) },
  );

export const updateMember = (
  request: SessionRequest,
  groupId: string,
  memberId: string,
  body: object,
) =>
  request(`/api/v1/groups/${groupId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const getMemberHistory = (
  request: SessionRequest,
  groupId: string,
  memberId: string,
  offset: number,
  signal?: AbortSignal,
) =>
  request<MemberHistory>(
    `/api/v1/groups/${groupId}/members/${memberId}/history?offset=${offset}`,
    { signal },
  );
