import { IsUUID } from "class-validator";

export class WithdrawalKeyDto {
  @IsUUID("4")
  requestKey!: string;
}
