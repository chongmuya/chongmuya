import { IsInt, IsUUID, Min } from "class-validator";
export class ReservationDecisionInput {
  @IsUUID() requestKey!: string;
  @IsUUID() targetId!: string;
  @IsInt() @Min(1) revision!: number;
  @IsInt() @Min(1) expectedVersion!: number;
}
