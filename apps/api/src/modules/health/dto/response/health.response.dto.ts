import { ApiProperty } from "@nestjs/swagger";

export class HealthDto {
  @ApiProperty({ enum: ["ok"] })
  status!: "ok";

  @ApiProperty({ enum: ["chongmuya-api"] })
  service!: "chongmuya-api";
}
