import { ApiProperty } from "@nestjs/swagger";

export class ErrorResponseDto {
  @ApiProperty({ example: 503 })
  statusCode!: number;

  @ApiProperty({ example: "SERVICE_UNAVAILABLE" })
  code!: string;

  @ApiProperty({ example: "서비스가 준비되지 않았습니다." })
  message!: string;

  @ApiProperty({ format: "uuid" })
  requestId!: string;
}
