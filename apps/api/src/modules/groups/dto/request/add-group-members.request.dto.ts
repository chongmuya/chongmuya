import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GroupMemberInput } from "./group-member.request.dto.js";

export class AddedGroupMemberInput extends GroupMemberInput {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  existingMemberId?: string;
}
export class AddGroupMembersInput {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  requestKey!: string;
  @ApiProperty({ type: [AddedGroupMemberInput], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AddedGroupMemberInput)
  members!: AddedGroupMemberInput[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  duplicatesConfirmed?: boolean;
}
