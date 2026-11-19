import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  IsObject,
  IsBoolean,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class InquiryConditionsInput {
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
  @IsInt() @Min(1) @Max(100000) expectedGuests!: number;
  @Transform(trim) @IsString() @Length(1, 80) region!: string;
  @IsIn(["CLOSE", "SEPARATED", "ANY"]) seating!: "CLOSE" | "SEPARATED" | "ANY";
  @IsIn(["HALL", "ROOM", "FLOOR", "WHOLE", "ANY"]) space!:
    "HALL" | "ROOM" | "FLOOR" | "WHOLE" | "ANY";
  @IsOptional() @IsIn(["REQUIRED", "PREFERRED"]) seatingImportance?:
    "REQUIRED" | "PREFERRED" | null;
  @IsOptional() @IsIn(["REQUIRED", "PREFERRED"]) spaceImportance?:
    "REQUIRED" | "PREFERRED" | null;
  @IsOptional() @IsIn(["PER_PERSON", "TOTAL"]) budgetBasis?:
    "PER_PERSON" | "TOTAL" | null;
  @IsOptional() @IsInt() @Min(1) @Max(1000000000) budgetAmount?: number | null;
  @IsOptional() @IsIn(["INCLUDED", "EXCLUDED", "UNKNOWN"]) alcohol?:
    "INCLUDED" | "EXCLUDED" | "UNKNOWN" | null;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  additionalRequests?: string | null;
}
export class InquiryContactInput {
  @Transform(trim) @IsString() @Length(1, 80) name!: string;
  @IsString() @Matches(/^0\d{8,10}$/) phone!: string;
}
export class CreateReservationRequestInput {
  @IsOptional() @IsUUID() previousRequestId?: string;
  @IsOptional() @IsInt() @Min(1) expectedRequestVersion?: number;
  @IsOptional() @IsBoolean() updateEventSchedule?: boolean;
  @IsUUID() requestKey!: string;
  @IsIn(["DIRECT"]) mode!: "DIRECT";
  @IsInt() @Min(1) expectedEventVersion!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((id: unknown) =>
          typeof id === "string" ? id.toLowerCase() : id,
        )
      : value,
  )
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  restaurantIds!: string[];
  @IsObject()
  @ValidateNested()
  @Type(() => InquiryConditionsInput)
  conditions!: InquiryConditionsInput;
  @IsObject()
  @ValidateNested()
  @Type(() => InquiryContactInput)
  contact!: InquiryContactInput;
}
