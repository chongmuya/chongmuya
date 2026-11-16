import { ApiProperty } from "@nestjs/swagger";

export class PhoneVerificationDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ enum: ["pending", "verified", "expired"] })
  status!: "pending" | "verified" | "expired";
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
  @ApiProperty({ format: "date-time" }) retryAt!: string;
  @ApiProperty({ format: "date-time" }) nextCheckAt!: string;
  @ApiProperty({ format: "date-time" }) serverNow!: string;
  @ApiProperty({ minimum: 0, maximum: 12 }) checksRemaining!: number;
}

export class CreatedPhoneVerificationDto extends PhoneVerificationDto {
  @ApiProperty() receiver!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ description: "인증 문자가 담긴 PNG data URL" })
  qrCode!: string;
}
