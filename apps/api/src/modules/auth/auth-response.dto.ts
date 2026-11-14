import { ApiProperty } from "@nestjs/swagger";

export class AccountDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() email!: string;
}

export class SessionDto {
  @ApiProperty() authenticated!: boolean;
  @ApiProperty({ type: AccountDto, nullable: true })
  account!: AccountDto | null;
}
