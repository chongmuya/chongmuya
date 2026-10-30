import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class CredentialsDto {
  @ApiProperty({ example: "user@example.com", maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: "password",
    writeOnly: true,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class AccountDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() email!: string;
}

export class SessionDto {
  @ApiProperty() authenticated!: boolean;
  @ApiProperty({ type: AccountDto, nullable: true })
  account!: AccountDto | null;
}
