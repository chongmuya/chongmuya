import { ApiProperty } from "@nestjs/swagger";

export class AccountDto {
  @ApiProperty({ type: String, enum: ["organizer", "owner"], nullable: true })
  accountType!: "organizer" | "owner" | null;
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) nickname!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  phoneVerifiedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  emailVerifiedAt!: string | null;
}
