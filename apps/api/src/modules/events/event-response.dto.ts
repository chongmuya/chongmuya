import { ApiProperty } from "@nestjs/swagger";

export class EventDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() groupId!: string;
  @ApiProperty({ type: String, nullable: true }) scheduledAt!: string | null;
}
