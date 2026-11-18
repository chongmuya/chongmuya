import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AttendanceService } from "./attendance.service.js";
import {
  OpenAttendanceInput,
  SaveAttendanceInput,
} from "./dto/request/attendance.request.dto.js";

@ApiTags("public-attendance")
@Controller("api/v1/attendance/:shareId")
export class PublicAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  info(@Param("shareId", ParseUUIDPipe) share: string, @Req() req: Request) {
    return this.attendance.publicInfo(
      share,
      req.ip ?? req.socket.remoteAddress ?? "unknown",
    );
  }
  @Post("open")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  open(
    @Param("shareId", ParseUUIDPipe) share: string,
    @Body() body: OpenAttendanceInput,
    @Req() req: Request,
  ) {
    return this.attendance.open(
      share,
      body,
      req.ip ?? req.socket.remoteAddress ?? "unknown",
    );
  }
  @Post("response")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  save(
    @Param("shareId", ParseUUIDPipe) share: string,
    @Body() body: SaveAttendanceInput,
    @Req() req: Request,
  ) {
    return this.attendance.save(
      share,
      body,
      req.ip ?? req.socket.remoteAddress ?? "unknown",
    );
  }
}
