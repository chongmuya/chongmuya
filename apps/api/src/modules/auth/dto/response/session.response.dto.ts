import { ApiProperty } from "@nestjs/swagger";
import { AccountDto } from "./account.response.dto.js";

export class SessionDto {
  @ApiProperty() authenticated!: boolean;
  @ApiProperty({ type: AccountDto, nullable: true })
  account!: AccountDto | null;
}
