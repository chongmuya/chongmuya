import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
export class FirstSetupDto {
  @ApiPropertyOptional({ enum: ["organizer", "owner"] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["organizer", "owner"])
  accountType?: "organizer" | "owner";
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  @Matches(/\S/)
  nickname?: string;
}
