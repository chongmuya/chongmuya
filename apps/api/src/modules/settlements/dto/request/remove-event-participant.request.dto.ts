import { IsInt, Min } from "class-validator";

export class RemoveEventParticipantInput {
  @IsInt() @Min(1) expectedVersion!: number;
}
