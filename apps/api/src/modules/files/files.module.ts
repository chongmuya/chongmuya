import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EventsModule } from "../events/events.module.js";
import { FilesService } from "./files.service.js";
import { FilesController } from "./files.controller.js";
import { FileStorage, S3FileStorage } from "./file-storage.js";
@Module({
  imports: [DatabaseModule, ConfigModule, AuthModule, EventsModule],
  controllers: [FilesController],
  providers: [FilesService, { provide: FileStorage, useClass: S3FileStorage }],
  exports: [FilesService],
})
export class FilesModule {}
