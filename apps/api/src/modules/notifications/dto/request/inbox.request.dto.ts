import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from "class-validator";
export class InboxQuery {
  @IsOptional() @Matches(/^\d{1,19}$/) before?: string;
}
export class ReadInboxInput {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @Matches(/^\d{1,19}$/) through?: string;
}
export class NotificationPreferencesInput {
  @IsBoolean() reservation!: boolean;
  @IsBoolean() settlement!: boolean;
  @IsBoolean() event!: boolean;
  @IsInt() @Min(0) expectedVersion!: number;
}
