import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class RestaurantRegionQuery {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100000)
  expectedGuests?: number;
}

export class RestaurantsQuery extends RestaurantRegionQuery {
  @ApiPropertyOptional({ default: 1 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;
}
