import { ApiProperty } from "@nestjs/swagger";

export class GroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) groupType!: string | null;
  @ApiProperty() memberCount!: number;
}

export class AddedGroupMembersDto {
  @ApiProperty({ type: GroupDto }) group!: GroupDto;
  @ApiProperty() addedCount!: number;
}

export class GroupMemberDto {
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, nullable: true }) label!: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) phoneLast4!: string | null;
}
