import { IsOptional, IsString, Length, Matches, IsUUID } from "class-validator";
export class ProfileInput {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsString() @Length(1, 100) nickname?: string;
}
export class PhoneChangeInput {
  @Matches(/^01[016789]\d{7,8}$/) phone!: string;
}
export class VerifyPhoneChangeInput {
  @Matches(/^01[016789]\d{7,8}$/) phone!: string;
  @IsUUID() id!: string;
}
