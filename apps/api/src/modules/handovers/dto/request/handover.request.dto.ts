import { IsUUID, Matches, IsInt, Min } from "class-validator";
export class HandoverInput {
  @IsUUID() requestKey!: string;
  @IsUUID() targetId!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @Matches(/^[a-f0-9]{64}$/) token!: string;
}
export class HandoverTokenInput {
  @Matches(/^[a-f0-9]{64}$/) token!: string;
}
export class AcceptHandoverInput {
  @Matches(/^[a-f0-9]{64}$/) token!: string;
  @IsUUID() requestKey!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}
