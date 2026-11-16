import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, Matches } from "class-validator";

export class CreatePhoneVerificationDto {
  @ApiProperty({ pattern: "^010[0-9]{8}$" })
  @IsString()
  @Matches(/^010\d{8}$/)
  phone!: string;
}
export class CheckPhoneVerificationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID("4") id!: string;
  @ApiProperty({ pattern: "^010[0-9]{8}$" })
  @IsString()
  @Matches(/^010\d{8}$/)
  phone!: string;
}
export class CancelPhoneVerificationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID("4") id!: string;
}
