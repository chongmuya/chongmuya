import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { GroupMemberInput } from "./group-member.request.dto.js";
import { GROUP_TYPES, type GroupType } from "../../types/group-type.js";

export class CreateGroupInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ nullable: true, enum: GROUP_TYPES })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsIn(GROUP_TYPES)
  groupType?: GroupType | null;

  // Old clients can create a group without a roster; the new flow always supplies a key.
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  creationKey?: string;

  @ApiPropertyOptional({ type: [GroupMemberInput], maxItems: 500 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GroupMemberInput)
  members?: GroupMemberInput[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  duplicatesConfirmed?: boolean;
}
