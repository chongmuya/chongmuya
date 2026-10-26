import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "../config/config.module.js";
import { ConfigService } from "../config/config.service.js";
import { databaseOptions } from "./database-options.js";
import { DatabaseService } from "./database.service.js";

@Module({
  imports: [TypeOrmModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      ...databaseOptions(config.environment),
      // Keep liveness available even when the DB is down during startup.
      manualInitialization: true,
    }),
  })],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
