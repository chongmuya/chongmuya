import { Transform } from "class-transformer";
import {
  IsEmail,
  IsUUID,
  Matches,
  IsInt,
  Min,
  IsBoolean,
  IsOptional,
} from "class-validator";
import { GroupMemberInput } from "./group-member.request.dto.js";
export class InvitationInput {
  @IsUUID() requestKey!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
  @Matches(/^[a-f0-9]{64}$/) token!: string;
}
export class InvitationTokenInput {
  @Matches(/^[a-f0-9]{64}$/) token!: string;
}
export class EditGroupMemberInput extends GroupMemberInput {
  @IsUUID() requestKey!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsBoolean() exclude!: boolean;
  @IsOptional() @IsBoolean() duplicatesConfirmed?: boolean;
}
