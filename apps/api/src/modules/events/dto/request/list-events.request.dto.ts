import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class EventsQuery {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
