import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsString,
  Length,
  IsOptional,
  IsISO8601,
  Matches,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class EventInput {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  creationKey?: string;
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100000)
  expectedGuests?: number;

  @ApiPropertyOptional({ nullable: true, example: "2026-11-03T18:00:00+09:00" })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt?: string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  importGroupRoster?: boolean;
}
