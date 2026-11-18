import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  normalizePersonName,
  personNamePattern,
} from "../../../../common/validation/person-name.js";

export class GroupMemberInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? normalizePersonName(value) : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(personNamePattern)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 40 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 40)
  label?: string | null;

  @ApiPropertyOptional({ nullable: true, pattern: "^[0-9]{4}$" })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4}$/)
  phoneLast4?: string | null;
}
