import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, IsUUID, Matches, MaxLength } from "class-validator";
export class CreateEmailVerificationDto {
  @ApiProperty({ maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class CheckEmailVerificationDto extends CreateEmailVerificationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID("4") id!: string;
  @ApiProperty({ writeOnly: true, pattern: "^[0-9]{6}$" })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
export class CancelEmailVerificationDto {
  @ApiProperty({ format: "uuid" }) @IsUUID("4") id!: string;
}
