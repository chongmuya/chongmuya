import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { MigrationInterface, QueryRunner } from "typeorm";

// Immutable migration snapshot. Original descriptions stay archived in their columns
// and in sourceDescriptions; no price, deadline or address part is inferred.
const empty = {
  hours: null,
  holidays: { kind: "UNKNOWN", weekdays: [], note: "" },
  advance: { kind: "UNKNOWN", days: null },
  minimumOrder: { kind: "UNKNOWN", amount: null, quantity: null, unit: "" },
  menuDeadline: { kind: "UNKNOWN", value: null },
  guestDeadline: { kind: "UNKNOWN", value: null },
  usage: { kind: "UNKNOWN", minutes: null },
  deposit: { kind: "UNKNOWN", amount: null },
};
const sections: Record<string, (keyof typeof empty)[]> = {
  operatingHours: ["hours", "holidays"],
  bookingPolicy: ["advance", "minimumOrder", "guestDeadline", "usage"],
  depositPolicy: ["deposit"],
  menuPolicy: ["menuDeadline"],
  cancellationPolicy: [],
};
const normalize = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ");
export class RestaurantCatalogModel1795564800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query("LOCK TABLE restaurants IN ACCESS EXCLUSIVE MODE");
    const rows = (await q.query(
      `SELECT id,name,base_address,detail_address,registration_key,policies,operating_hours,booking_policy,deposit_policy,menu_policy,cancellation_policy FROM restaurants`,
    )) as {
      id: string;
      name: string;
      base_address: string | null;
      detail_address: string | null;
      registration_key: string | null;
      policies:
        (Record<string, unknown> & { descriptionOverrides?: string[] }) | null;
      operating_hours: string | null;
      booking_policy: string | null;
      deposit_policy: string | null;
      menu_policy: string | null;
      cancellation_policy: string | null;
    }[];
    for (const row of rows) {
      const policies = row.policies;
      const sourceDescriptions = {
        operatingHours: row.operating_hours,
        bookingPolicy: row.booking_policy,
        depositPolicy: row.deposit_policy,
        menuPolicy: row.menu_policy,
        cancellationPolicy: row.cancellation_policy,
      };
      const descriptionOverrides =
        policies?.descriptionOverrides ??
        Object.keys(sections).filter(
          (key) =>
            policies &&
            sections[key]!.some(
              (field) => !isDeepStrictEqual(policies[field], empty[field]),
            ),
        );
      await q.query("UPDATE restaurants SET policies=$2::jsonb WHERE id=$1", [
        row.id,
        JSON.stringify({
          ...empty,
          ...policies,
          descriptionOverrides,
          sourceDescriptions,
        }),
      ]);
    }
    const defaultPolicies = {
      ...empty,
      descriptionOverrides: [],
      sourceDescriptions: {
        operatingHours: null,
        bookingPolicy: null,
        depositPolicy: null,
        menuPolicy: null,
        cancellationPolicy: null,
      },
    };
    await q.query(
      `ALTER TABLE restaurants ALTER COLUMN policies SET NOT NULL, ALTER COLUMN policies SET DEFAULT '${JSON.stringify(defaultPolicies)}'::jsonb`,
    );
    await q.query(
      `CREATE FUNCTION restaurant_identity_text(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$ SELECT btrim(regexp_replace(normalize(value,NFC),'\\s+',' ','g')) $$`,
    );
    await q.query(`ALTER TABLE restaurants
      ADD normalized_name text GENERATED ALWAYS AS (restaurant_identity_text(name)) STORED,
      ADD normalized_address text GENERATED ALWAYS AS (restaurant_identity_text(address)) STORED,
      ADD normalized_base_address text GENERATED ALWAYS AS (restaurant_identity_text(base_address)) STORED,
      ADD normalized_detail_address text GENERATED ALWAYS AS (restaurant_identity_text(coalesce(detail_address,''))) STORED,
      ADD identity_conflict boolean NOT NULL DEFAULT false,
      ADD identity_review varchar(40)`);
    // TypeORM needs the stored expressions when inspecting generated columns.
    // Keep this explicit migration usable in an isolated schema as well as the CLI.
    await q.query(`CREATE TABLE IF NOT EXISTS typeorm_metadata (
      type varchar NOT NULL, database varchar, schema varchar,
      "table" varchar, name varchar, value text
    )`);
    for (const [name, expression] of [
      ["normalized_name", "restaurant_identity_text(name)"],
      ["normalized_address", "restaurant_identity_text(address)"],
      ["normalized_base_address", "restaurant_identity_text(base_address)"],
      [
        "normalized_detail_address",
        "restaurant_identity_text(coalesce(detail_address,''))",
      ],
    ])
      await q.query(
        `INSERT INTO typeorm_metadata(type,database,schema,"table",name,value)
        VALUES('GENERATED_COLUMN',current_database(),current_schema(),'restaurants',$1,$2)`,
        [name, expression],
      );
    await q.query(
      `UPDATE restaurants SET identity_review='UNSTRUCTURED_ADDRESS' WHERE base_address IS NULL`,
    );
    await q.query(
      `UPDATE restaurants r SET identity_conflict=true, identity_review='DUPLICATE_IDENTITY' WHERE EXISTS(SELECT 1 FROM restaurants other WHERE other.id<>r.id AND other.normalized_name=r.normalized_name AND (other.normalized_address=r.normalized_address OR (r.base_address IS NOT NULL AND other.normalized_base_address=r.normalized_base_address AND other.normalized_detail_address=r.normalized_detail_address)))`,
    );
    const keys = rows.map((r) => ({
      id: r.id,
      key: r.base_address
        ? createHash("sha256")
            .update(
              JSON.stringify([
                normalize(r.name),
                normalize(r.base_address),
                normalize(r.detail_address ?? ""),
              ]),
            )
            .digest("hex")
        : r.registration_key,
    }));
    // Clear keys being rebuilt first, so corrected or swapped keys cannot collide mid-migration.
    await q.query(
      "UPDATE restaurants SET registration_key=NULL WHERE base_address IS NOT NULL",
    );
    for (const row of keys)
      if (row.key && keys.filter((other) => other.key === row.key).length === 1)
        await q.query(
          "UPDATE restaurants SET registration_key=$2 WHERE id=$1",
          [row.id, row.key],
        );
    await q.query(
      `CREATE UNIQUE INDEX restaurants_identity_full ON restaurants(normalized_name,normalized_address) WHERE NOT identity_conflict`,
    );
    await q.query(
      `CREATE UNIQUE INDEX restaurants_identity_structured ON restaurants(normalized_name,normalized_base_address,normalized_detail_address) WHERE NOT identity_conflict AND base_address IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX restaurants_identity_lookup ON restaurants(normalized_name)`,
    );
    // Preserved conflicts cannot become a loophole for new duplicates. The same catalog
    // lock is also used by registration and explicit address normalization.
    await q.query(`CREATE FUNCTION guard_restaurant_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='UPDATE' AND (NEW.name,NEW.address,NEW.base_address,NEW.detail_address) IS NOT DISTINCT FROM (OLD.name,OLD.address,OLD.base_address,OLD.detail_address) THEN RETURN NEW; END IF;
      IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM restaurants WHERE id=NEW.id) THEN RETURN NEW; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('restaurant-registration',0));
      IF EXISTS(SELECT 1 FROM restaurants r WHERE r.id<>NEW.id AND r.normalized_name=restaurant_identity_text(NEW.name) AND (r.normalized_address=restaurant_identity_text(NEW.address) OR (NEW.base_address IS NOT NULL AND r.normalized_base_address=restaurant_identity_text(NEW.base_address) AND r.normalized_detail_address=restaurant_identity_text(coalesce(NEW.detail_address,''))))) THEN
        RAISE EXCEPTION 'Restaurant identity conflict' USING ERRCODE='23505',CONSTRAINT='restaurants_identity_full';
      END IF;
      NEW.identity_conflict=false;
      NEW.identity_review=CASE WHEN NEW.base_address IS NULL THEN 'UNSTRUCTURED_ADDRESS' ELSE NULL END;
      RETURN NEW;
    END $$`);
    await q.query(
      `CREATE TRIGGER restaurants_identity_guard BEFORE INSERT OR UPDATE OF name,address,base_address,detail_address ON restaurants FOR EACH ROW EXECUTE FUNCTION guard_restaurant_identity()`,
    );
  }
  async down(): Promise<void> {
    throw new Error(
      "RestaurantCatalogModel requires a forward migration preserving policy sources and identity review rows.",
    );
  }
}
