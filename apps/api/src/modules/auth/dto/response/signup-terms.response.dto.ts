import { ApiProperty } from "@nestjs/swagger";

export class SignupTermDto {
  @ApiProperty({
    enum: ["serviceTerms", "privacyCollection", "privacyPolicy", "marketing"],
  })
  id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty() version!: string;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: [String] }) body!: string[];
  @ApiProperty() draft!: boolean;
}

export class SignupTermsDto {
  @ApiProperty({ type: [SignupTermDto] }) terms!: SignupTermDto[];
}
