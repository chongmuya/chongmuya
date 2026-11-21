import { IsUUID, IsInt, Min, IsBoolean, IsOptional } from "class-validator";
import { GroupMemberInput } from "./group-member.request.dto.js";
export class EditGroupMemberInput extends GroupMemberInput {
  @IsUUID() requestKey!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsBoolean() exclude!: boolean;
  @IsOptional() @IsBoolean() duplicatesConfirmed?: boolean;
}
