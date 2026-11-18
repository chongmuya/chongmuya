import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import {
  normalizePersonName,
  personNamePattern,
} from "../../../common/validation/person-name.js";

export type AttendanceAccess = {
  roundId: string;
  name: string;
  phoneLast4: string;
  participantId: string | null;
  identityVersion: number | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const signature = (value: string, secret: string) =>
  createHmac("sha256", secret).update(`attendance-access:v1:${value}`).digest();
export function issueAttendanceAccess(value: AttendanceAccess, secret: string) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${data}.${signature(data, secret).toString("base64url")}`;
}
export function readAttendanceAccess(
  token: string,
  secret: string,
): AttendanceAccess {
  try {
    const [data, encoded, ...rest] = token.split(".");
    if (!data || !encoded || rest.length || token.length > 2048)
      throw new Error();
    const given = Buffer.from(encoded, "base64url"),
      expected = signature(data, secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new Error();
    const v = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as AttendanceAccess;
    if (
      !uuid.test(v.roundId) ||
      typeof v.name !== "string" ||
      v.name !== normalizePersonName(v.name) ||
      !personNamePattern.test(v.name) ||
      v.name.length > 100 ||
      !/^\d{4}$/.test(v.phoneLast4) ||
      (v.participantId !== null &&
        (!uuid.test(v.participantId) ||
          !Number.isInteger(v.identityVersion) ||
          v.identityVersion! < 1))
    )
      throw new Error();
    return v;
  } catch {
    throw new DomainHttpException("ATTENDANCE_ACCESS_INVALID");
  }
}
