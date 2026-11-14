import { Transform } from "class-transformer";
import {
  IsString,
  Length,
  IsOptional,
  IsISO8601,
  Matches,
  IsUUID,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class EventInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: "2026-11-03T18:00:00+09:00" })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt?: string | null;
  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}
