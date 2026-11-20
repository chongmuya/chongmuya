import { Transform } from "class-transformer";
import { IsString, Length, IsIn, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GROUP_TYPES, type GroupType } from "../../types/group-type.js";

export class GroupInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiPropertyOptional({ enum: GROUP_TYPES, nullable: true })
  @IsOptional()
  @IsIn(GROUP_TYPES)
  groupType?: GroupType | null;
}
