import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
export class RequestPasswordResetDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsOptional() @IsString() @MaxLength(1000) next?: string;
}
export class CheckPasswordResetDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class SavePasswordResetDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
  @IsString() @Matches(/^[\x21-\x7e]{8,16}$/) password!: string;
}
