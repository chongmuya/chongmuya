import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  Matches,
} from "class-validator";
export class DraftCreateInput {
  @IsOptional() @IsUUID() restaurantId?: string;
}
export class DraftSaveInput {
  @IsInt() @Min(1) version!: number;
  @IsInt() @Min(0) @Max(5) step!: number;
  @IsObject() data!: Record<string, unknown>;
  @IsOptional() @IsUUID() addressId?: string;
}
export class AddressSearchInput {
  @IsString() @Length(2, 200) query!: string;
}
export class DraftSubmitInput {
  @IsInt() @Min(1) version!: number;
}
export class ContactVerifyInput {
  @IsString() @Matches(/^01[016789]\d{7,8}$/) phone!: string;
}
export class ContactCheckInput extends ContactVerifyInput {
  @IsUUID() verificationId!: string;
}
export class MenuSaveInput {
  @IsInt() @Min(1) version!: number;
  @IsObject() menu!: Record<string, unknown>;
}
export class ContactConsentInput {
  @IsBoolean() consent!: boolean;
}
