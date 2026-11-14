import { Transform } from "class-transformer";
import { IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class GroupInput {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;
}
