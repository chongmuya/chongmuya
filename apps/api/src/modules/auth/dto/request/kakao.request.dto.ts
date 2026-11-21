import { passwordPattern } from "../../utils/password.js";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { SignupConsentDto } from "./signup.request.dto.js";
export class StartKakaoDto {
  @IsOptional() @IsString() @MaxLength(1000) next?: string;
}
export class StartKakaoLinkDto {
  @IsString() @Matches(passwordPattern) password!: string;
  @IsBoolean() consent!: boolean;
}
export class KakaoSignupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString() @MaxLength(100) @Matches(/\S/) name!: string;
  @IsString() @Matches(/^010\d{8}$/) phone!: string;
  @IsOptional() @IsUUID("4") emailVerificationId?: string;
  @IsUUID("4") phoneVerificationId!: string;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SignupConsentDto)
  consents!: SignupConsentDto[];
}

export class CancelKakaoDto {
  @IsUUID("4") id!: string;
}
