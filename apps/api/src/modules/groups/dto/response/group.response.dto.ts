import { ApiProperty } from "@nestjs/swagger";

export class GroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) groupType!: string | null;
  @ApiProperty() memberCount!: number;
}

export class GroupMemberDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) phoneLast4!: string | null;
}
