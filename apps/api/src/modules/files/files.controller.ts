import {
  Controller,
  UseGuards,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Header,
  Body,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
  HttpCode,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { FilesService } from "./files.service.js";
import { MAX_FILE_BYTES } from "./lib/validate-file.js";
import {
  DeleteFileInput,
  UploadFileInput,
} from "./dto/request/file.request.dto.js";
@Controller("api/v1/events/:eventId/files")
@UseGuards(AccessGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) e: string,
  ) {
    return this.files.list(u.id, e);
  }
  @Post(":id/upload")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: MAX_FILE_BYTES,
        fieldSize: 1024,
        files: 1,
        fields: 1,
        parts: 2,
      },
    }),
  )
  upload(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) e: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UploadFileInput,
    @UploadedFile()
    f: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  ) {
    if (!f) throw new DomainHttpException("FILE_INVALID");
    return this.files.upload(u.id, e, id, {
      ...f,
      originalname: body.filename ?? f.originalname,
    });
  }
  @Get(":id/download")
  @Header("Cache-Control", "no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async download(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) e: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const f = await this.files.download(u.id, e, id);
    return new StreamableFile(f.body, {
      type: "application/octet-stream",
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    });
  }
  @Post(":id/delete") @HttpCode(200) remove(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) e: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: DeleteFileInput,
  ) {
    return this.files.remove(u.id, e, id, b.expectedVersion);
  }
}
