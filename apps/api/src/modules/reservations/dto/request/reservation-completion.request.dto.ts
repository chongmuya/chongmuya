import { IsObject } from "class-validator";
export class ReservationCompletionBody {
  @IsObject() command!: Record<string, unknown>;
}
