import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class GroupMemberInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ nullable: true, pattern: "^[0-9]{4}$" })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4}$/)
  phoneLast4?: string | null;
}

export class CreateGroupInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 40 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 40)
  groupType?: string | null;

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
