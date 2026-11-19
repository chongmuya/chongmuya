import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsBoolean,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import {
  normalizePersonName,
  personNamePattern,
} from "../../../../common/validation/person-name.js";

export class ParticipantInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? normalizePersonName(value) : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(personNamePattern)
  name!: string;
  @IsOptional() @IsString() @Matches(/^[0-9]{4}$/) phoneLast4?: string | null;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 40)
  label?: string | null;
}
export class RosterPersonChoice extends ParticipantInput {
  @IsOptional() @IsUUID() existingParticipantId?: string;
  @IsOptional() @IsBoolean() newPersonConfirmed?: boolean;
}
export class ReviewedParticipant {
  @IsUUID() id!: string;
  @IsInt() @Min(1) version!: number;
}
export class AddEventParticipantsInput {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => ReviewedParticipant)
  expectedRoster?: ReviewedParticipant[];
  @IsOptional() @IsBoolean() duplicatesConfirmed?: boolean;
  @IsUUID() requestKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RosterPersonChoice)
  members!: RosterPersonChoice[];
}
export class UpdateEventParticipantInput extends ParticipantInput {
  @IsInt() @Min(1) expectedVersion!: number;
}
