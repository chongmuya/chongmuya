import { ApiProperty } from "@nestjs/swagger";
import { HealthDto } from "./health.response.dto.js";

export class ReadinessDto extends HealthDto {
  @ApiProperty({ enum: ["up"] })
  database!: "up";
}
