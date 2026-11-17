import { ApiProperty } from "@nestjs/swagger";
export class EmailVerificationDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ["pending", "verified", "expired", "failed"] }) status!:
    "pending" | "verified" | "expired" | "failed";
  @ApiProperty() expiresAt!: string;
  @ApiProperty() retryAt!: string;
  @ApiProperty() serverNow!: string;
  @ApiProperty() attemptsRemaining!: number;
}
