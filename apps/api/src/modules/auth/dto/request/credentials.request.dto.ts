import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CredentialsDto {
  @ApiProperty({ example: "user@example.com", maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 16,
    pattern: "^[\\x21-\\x7e]+$",
    format: "password",
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  @Matches(/^[\x21-\x7e]+$/)
  password!: string;
}
