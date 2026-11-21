import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  IsUUID,
  Min,
} from "class-validator";
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
export class OwnerDepositAccountInput {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() @Length(1, 80) bank!: string;
  @Matches(/^(?=.*\d)[\d -]{4,100}$/) account!: string;
  @IsString() @Length(1, 80) holder!: string;
}
