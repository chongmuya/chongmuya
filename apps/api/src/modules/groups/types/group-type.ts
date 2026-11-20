export const GROUP_TYPES = [
  "동아리",
  "학생회",
  "학회",
  "친목 모임",
  "기타",
] as const;
export type GroupType = (typeof GROUP_TYPES)[number];
