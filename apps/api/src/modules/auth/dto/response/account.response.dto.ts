import { ApiProperty } from "@nestjs/swagger";

export class AccountDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() email!: string;
}
