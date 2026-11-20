import { Type } from "class-transformer";
import {
  IsOptional,
  IsUUID,
  IsString,
  MaxLength,
  IsISO8601,
  IsInt,
  Min,
  Max,
} from "class-validator";
export class RecordsQuery {
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsISO8601() before?: string;
  @IsOptional() @IsISO8601() after?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset = 0;
}
