import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class SignupConsentDto {
  @ApiProperty({
    enum: ["serviceTerms", "privacyCollection", "privacyPolicy", "marketing"],
  })
  @IsIn(["serviceTerms", "privacyCollection", "privacyPolicy", "marketing"])
  id!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) version!: string;
  @ApiProperty() @IsBoolean() accepted!: boolean;
}

export class SignupDto {
  @ApiProperty({ enum: ["organizer", "owner"] })
  @IsIn(["organizer", "owner"])
  accountType!: "organizer" | "owner";
  @ApiProperty({ maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({
    minLength: 8,
    maxLength: 16,
    format: "password",
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  @Matches(/^[\x21-\x7e]+$/)
  password!: string;
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/\S/)
  nickname!: string;
  @ApiProperty({ pattern: "^010[0-9]{8}$" })
  @IsString()
  @Matches(/^010\d{8}$/)
  phone!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID("4") phoneVerificationId!: string;
  @ApiProperty({ type: [SignupConsentDto] })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SignupConsentDto)
  consents!: SignupConsentDto[];
}
