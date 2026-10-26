import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private initializing?: Promise<DataSource>;
  private closing = false;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async connect(): Promise<DataSource> {
    if (this.closing) throw new Error("Database is shutting down");
    // TypeORM can set isInitialized before metadata setup finishes.
    if (this.initializing) return this.initializing;
    if (this.dataSource.isInitialized) return this.dataSource;
    this.initializing = this.dataSource.initialize();
    try {
      return await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  async onModuleDestroy() {
    this.closing = true;
    // Finish initialization before TypeOrmModule closes its pool during shutdown.
    // Failed attempts remain retryable while the application is running.
    await this.initializing?.catch(() => undefined);
  }
}
