import { Transform } from "class-transformer";
import {
  IsString,
  Length,
  IsISO8601,
  IsOptional,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
export class GroupInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;
}
export class EventInput extends GroupInput {
  @ApiPropertyOptional({ nullable: true, example: "2026-11-03T18:00:00+09:00" })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt?: string | null;
}
export class GroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
export class EventDto extends GroupDto {
  @ApiProperty() groupId!: string;
  @ApiProperty({ type: String, nullable: true }) scheduledAt!: string | null;
}
