import type { MigrationInterface, QueryRunner } from "typeorm";
export class GroupHandover1795763000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Before this migration there is no handover command: owner is the known creator.
    for (const table of ["groups", "events", "calendar_schedules"]) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN creator_id uuid REFERENCES accounts(id);
UPDATE ${table} SET creator_id=owner_id;
ALTER TABLE ${table} ALTER COLUMN creator_id SET NOT NULL;`);
    }
    await q.query(`CREATE FUNCTION preserve_resource_creator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN NEW.creator_id := COALESCE(NEW.creator_id, NEW.owner_id);
 ELSIF NEW.creator_id IS DISTINCT FROM OLD.creator_id THEN RAISE EXCEPTION 'immutable creator'; END IF;
 RETURN NEW;
END $$;`);
    for (const table of ["groups", "events", "calendar_schedules"])
      await q.query(
        `CREATE TRIGGER ${table}_creator BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION preserve_resource_creator()`,
      );
    await q.query(`DROP INDEX groups_owner_creation_key;
CREATE UNIQUE INDEX groups_owner_creation_key ON groups(creator_id,creation_key);
DROP INDEX events_owner_creation_key;
CREATE UNIQUE INDEX events_owner_creation_key ON events(creator_id,creation_key);
DROP INDEX calendar_schedule_creation;
CREATE UNIQUE INDEX calendar_schedule_creation ON calendar_schedules(creator_id,creation_key);
ALTER TABLE reservation_requests ALTER COLUMN current_contact_name TYPE varchar(100);
ALTER TABLE reservation_requests ADD COLUMN contact_changes jsonb NOT NULL DEFAULT '[]';
ALTER TABLE groups ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE group_members ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN excluded_at timestamptz;
CREATE TABLE group_memberships (
 group_id uuid NOT NULL REFERENCES groups(id), account_id uuid NOT NULL REFERENCES accounts(id),
 role varchar(10) NOT NULL CHECK(role IN ('ADMIN','MEMBER')), joined_at timestamptz NOT NULL,
 PRIMARY KEY(group_id,account_id));
CREATE UNIQUE INDEX group_one_admin ON group_memberships(group_id) WHERE role='ADMIN';
INSERT INTO group_memberships SELECT id,owner_id,'ADMIN',created_at FROM groups;
CREATE TABLE group_invitations (
 id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES groups(id), actor_id uuid NOT NULL REFERENCES accounts(id),
 target_id uuid NOT NULL REFERENCES accounts(id), request_key uuid NOT NULL, digest varchar(64) NOT NULL,
 token_hash varchar(64) NOT NULL UNIQUE, status varchar(10) NOT NULL CHECK(status IN ('PENDING','ACCEPTED','CANCELLED')),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, completed_at timestamptz,
 UNIQUE(actor_id,request_key));
CREATE TABLE group_handovers (
 id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES groups(id), from_id uuid NOT NULL REFERENCES accounts(id),
 to_id uuid NOT NULL REFERENCES accounts(id), group_version integer NOT NULL, request_key uuid NOT NULL,
 digest varchar(64) NOT NULL, token_hash varchar(64) NOT NULL UNIQUE,
 status varchar(10) NOT NULL CHECK(status IN ('PENDING','ACCEPTED','CANCELLED','EXPIRED')),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, completed_at timestamptz,
 accepted_by uuid REFERENCES accounts(id), accept_key uuid, accept_digest varchar(64), completed_version integer,
 UNIQUE(from_id,request_key));
CREATE UNIQUE INDEX group_one_handover ON group_handovers(group_id) WHERE status='PENDING';
CREATE TABLE group_roster_edits (
 group_id uuid NOT NULL REFERENCES groups(id), actor_id uuid NOT NULL REFERENCES accounts(id), request_key uuid NOT NULL,
 member_id uuid NOT NULL REFERENCES group_members(id), digest varchar(64) NOT NULL, before_snapshot jsonb NOT NULL,
 after_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL,
 PRIMARY KEY(group_id,actor_id,request_key));
CREATE TABLE favorites (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), group_id uuid REFERENCES groups(id),
 restaurant_id uuid NOT NULL, created_at timestamptz NOT NULL);
CREATE UNIQUE INDEX favorites_personal ON favorites(account_id,restaurant_id) WHERE group_id IS NULL;
CREATE UNIQUE INDEX favorites_group ON favorites(group_id,restaurant_id) WHERE group_id IS NOT NULL;`);
  }
  async down(): Promise<void> {
    throw new Error(
      "Forward-only: preserve accepted transfers and immutable audit records.",
    );
  }
}
