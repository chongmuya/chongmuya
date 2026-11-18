import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
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
export class AddEventParticipantsInput {
  @IsUUID() requestKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ParticipantInput)
  members!: ParticipantInput[];
}
export class UpdateEventParticipantInput extends ParticipantInput {
  @IsInt() @Min(1) expectedVersion!: number;
}
