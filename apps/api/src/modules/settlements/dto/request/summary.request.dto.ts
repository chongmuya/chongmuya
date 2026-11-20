import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class EventSummariesQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.split(",") : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  eventIds!: string[];
}

export class MemberHistoryQuery {
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset = 0;
}
