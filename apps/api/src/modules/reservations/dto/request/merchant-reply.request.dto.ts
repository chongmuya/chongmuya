import { IsObject, IsString, Matches } from "class-validator";
export class MerchantAccessInput {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class MerchantReplyBody {
  @IsObject() reply!: Record<string, unknown>;
}
