import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsUUID, Max, Min } from "class-validator";

export class LinkEventGroupInput {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  groupId!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion!: number;
}
