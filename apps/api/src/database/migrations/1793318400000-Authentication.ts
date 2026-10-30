import type { MigrationInterface, QueryRunner } from "typeorm";

export class Authentication1793318400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE accounts (id uuid PRIMARY KEY, email varchar(254) UNIQUE NOT NULL,
        "passwordHash" text NOT NULL, "createdAt" timestamptz NOT NULL);
      CREATE TABLE auth_sessions (id uuid PRIMARY KEY, "accountId" uuid NOT NULL REFERENCES accounts(id),
        "expiresAt" timestamptz NOT NULL, "revokedAt" timestamptz);
      CREATE INDEX auth_sessions_account ON auth_sessions ("accountId");
      CREATE TABLE refresh_tokens (hash varchar(64) PRIMARY KEY,
        "sessionId" uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE, "usedAt" timestamptz);
      CREATE INDEX refresh_tokens_session ON refresh_tokens ("sessionId");
      CREATE TABLE auth_attempts (key varchar(64) PRIMARY KEY, count integer NOT NULL, "resetsAt" timestamptz NOT NULL);
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP TABLE auth_attempts, refresh_tokens, auth_sessions, accounts",
    );
  }
}
