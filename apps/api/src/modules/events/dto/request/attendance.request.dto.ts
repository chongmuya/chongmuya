import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";
import {
  normalizePersonName,
  personNamePattern,
} from "../../../../common/validation/person-name.js";
import type { AttendanceAnswer } from "../../types/attendance.js";

export class CreateRoundInput {
  @IsUUID() requestKey!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  title!: string;
}
export class OpenAttendanceInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? normalizePersonName(value) : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(personNamePattern)
  name!: string;
  @IsString() @Matches(/^[0-9]{4}$/) phoneLast4!: string;
}
export class SaveAttendanceInput {
  @IsString() @Length(1, 2048) accessToken!: string;
  @IsIn(["ATTENDING", "ABSENT"]) answer!: AttendanceAnswer;
}
export class SetAttendanceInput {
  @IsInt() @Min(0) expectedVersion!: number;
  @ValidateIf((_o, v: unknown) => v !== null)
  @IsIn(["ATTENDING", "ABSENT"])
  managerOverride!: AttendanceAnswer | null;
}
export class ResolveAttendanceInput {
  @IsInt() @Min(1) expectedReviewVersion!: number;
  @IsIn(["LINK", "NEW", "EXCLUDE"]) action!: "LINK" | "NEW" | "EXCLUDE";
  @ValidateIf(
    (o: ResolveAttendanceInput) =>
      o.action === "LINK" || o.participantId !== undefined,
  )
  @IsUUID()
  participantId?: string;
  @IsOptional() @IsInt() @Min(1) expectedParticipantVersion?: number;
  @IsOptional() @IsInt() @Min(0) expectedResponseVersion?: number;
  @IsOptional() @IsIn(["KEEP", "APPLY"]) responseChoice?: "KEEP" | "APPLY";
}
