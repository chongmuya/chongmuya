import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Max,
  Min,
} from "class-validator";
export class CalendarQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsUUID() restaurantId?: string;
}
export class ScheduleInput {
  @IsUUID() requestKey!: string;
  @IsOptional() @IsUUID() groupId?: string;
  @IsInt() @Min(0) @Max(2147483647) expectedVersion!: number;
  @IsString() @Length(1, 100) title!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt?: string;
  @IsBoolean() allDay!: boolean;
  @IsString() @MaxLength(100) memo!: string;
}
export class DeleteScheduleInput {
  @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number;
}
