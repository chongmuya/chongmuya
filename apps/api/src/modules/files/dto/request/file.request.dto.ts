import { IsInt, Min, IsOptional, IsString, MaxLength } from "class-validator";
export class DeleteFileInput {
  @IsInt() @Min(1) expectedVersion!: number;
}

export class UploadFileInput {
  @IsOptional() @IsString() @MaxLength(200) filename?: string;
}
