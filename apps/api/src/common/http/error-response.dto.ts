import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { FieldError } from "./domain-http.exception.js";

class FieldErrorDto {
  @ApiProperty({ example: "name" }) field!: string;
  @ApiProperty({
    enum: [
      "INVALID_TYPE",
      "INVALID_LENGTH",
      "INVALID_EMAIL",
      "INVALID_UUID",
      "INVALID_FORMAT",
      "INVALID_VALUE",
    ],
  })
  code!: FieldError["code"];
}

export class ErrorResponseDto {
  @ApiProperty({ example: 503 })
  statusCode!: number;

  @ApiProperty({ example: "SERVICE_UNAVAILABLE" })
  code!: string;

  @ApiProperty({ example: "서비스가 준비되지 않았습니다." })
  message!: string;

  @ApiProperty({ format: "uuid" })
  requestId!: string;

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  fieldErrors?: FieldErrorDto[];
}
