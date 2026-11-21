import { ApiProperty } from "@nestjs/swagger";

export class EventDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty({ type: String, nullable: true }) groupId!: string | null;
  @ApiProperty() reservationScheduleLocked!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ type: Number, nullable: true }) expectedGuests!: number | null;
  @ApiProperty({ type: String, nullable: true }) scheduledAt!: string | null;
}
