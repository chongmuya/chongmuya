import type { MigrationInterface, QueryRunner } from "typeorm";
export class MerchantRepliesAndDelivery1795395600000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE reservation_requests ADD COLUMN closed_at timestamptz`,
    );
    await q.query(`ALTER TABLE reservation_request_targets ADD COLUMN reply_version integer NOT NULL DEFAULT 0,
      DROP CONSTRAINT reservation_targets_status_check,
      ADD CONSTRAINT reservation_targets_status_check CHECK(delivery_status IN ('PENDING','PROCESSING','ACCEPTED','DELIVERED','FAILED','UNKNOWN','HELD','CANCELLED'))`);
    await q.query(`CREATE TABLE merchant_reply_links (
      target_id uuid PRIMARY KEY REFERENCES reservation_request_targets(id), digest varchar(64) NOT NULL,
      contact_id uuid NOT NULL, phone_snapshot varchar(20) NOT NULL, encrypted_token text, generation integer NOT NULL DEFAULT 1 CHECK(generation>0), expires_at timestamptz NOT NULL, revoked_at timestamptz)`);
    await q.query(`CREATE TABLE message_deliveries (
      id uuid PRIMARY KEY, target_id uuid NOT NULL REFERENCES reservation_request_targets(id), purpose varchar(32) NOT NULL DEFAULT 'NEW_INQUIRY',
      channel varchar(8) NOT NULL DEFAULT 'LMS', contact_id uuid NOT NULL, phone_snapshot varchar(20) NOT NULL,
      link_generation integer NOT NULL DEFAULT 1, template_version integer NOT NULL DEFAULT 1, variables jsonb NOT NULL, status varchar(16) NOT NULL DEFAULT 'PENDING', attempts integer NOT NULL DEFAULT 0,
      started_at timestamptz, lease_until timestamptz, provider_message_id varchar(100), provider_group_id varchar(100), provider varchar(16),
      failure_stage varchar(16), error_code varchar(80), created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
      CONSTRAINT message_deliveries_logical_unique UNIQUE(target_id,purpose,contact_id,channel),
      CONSTRAINT message_deliveries_status_check CHECK(status IN ('PENDING','PROCESSING','ACCEPTED','DELIVERED','FAILED','UNKNOWN','HELD','CANCELLED')))`);
    await q.query(
      `CREATE INDEX message_deliveries_provider_id ON message_deliveries(provider_message_id)`,
    );
    await q.query(`CREATE TABLE merchant_reply_revisions (
      id uuid PRIMARY KEY, target_id uuid NOT NULL REFERENCES reservation_request_targets(id), revision integer NOT NULL CHECK(revision>0),
      request_key uuid NOT NULL, digest varchar(64) NOT NULL, kind varchar(16) NOT NULL CHECK(kind IN ('AVAILABLE','CHANGE','DECLINE')),
      snapshot jsonb NOT NULL, reason varchar(1000) NOT NULL, expires_at timestamptz, actor jsonb NOT NULL, created_at timestamptz NOT NULL,
      CONSTRAINT merchant_reply_revision_unique UNIQUE(target_id,revision), CONSTRAINT merchant_reply_key_unique UNIQUE(target_id,request_key))`);
    await q.query(
      `CREATE TABLE message_delivery_reports (digest varchar(64) PRIMARY KEY, delivery_id uuid NOT NULL REFERENCES message_deliveries(id), message_id varchar(100) NOT NULL, status_code varchar(12) NOT NULL, received_at timestamptz NOT NULL)`,
    );
    await q.query(
      `CREATE TABLE reservation_operations (id uuid PRIMARY KEY, target_id uuid NOT NULL REFERENCES reservation_request_targets(id), action varchar(40) NOT NULL, actor varchar(100) NOT NULL, reason varchar(500) NOT NULL, created_at timestamptz NOT NULL)`,
    );
  }
  async down(q: QueryRunner) {
    // Refuse destructive rollback once a real delivery/reply has been recorded.
    const [row] = await q.query(
      `SELECT (SELECT count(*) FROM message_deliveries) + (SELECT count(*) FROM merchant_reply_revisions) AS count`,
    );
    if (Number(row.count))
      throw new Error(
        "Merchant delivery data exists; rollback requires an explicit preservation plan",
      );
    await q.query(
      `DROP TABLE reservation_operations, message_delivery_reports, merchant_reply_revisions, message_deliveries, merchant_reply_links`,
    );
    await q.query(
      `ALTER TABLE reservation_request_targets DROP COLUMN reply_version, DROP CONSTRAINT reservation_targets_status_check, ADD CONSTRAINT reservation_targets_status_check CHECK(delivery_status='PENDING')`,
    );
    await q.query(`ALTER TABLE reservation_requests DROP COLUMN closed_at`);
  }
}
