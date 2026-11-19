import type { DataSource } from "typeorm";

// Unlike showMigrations(), this never creates the history table on an empty DB.
export async function migrationState(db: DataSource) {
  const [{ present }] = (await db.query(
    "SELECT to_regclass('migrations') IS NOT NULL AS present",
  )) as { present: boolean }[];
  const rows = present
    ? ((await db.query("SELECT name FROM migrations ORDER BY id")) as {
        name: string;
      }[])
    : [];
  const executed = rows.map(({ name }) => name);
  const known = db.migrations.map(
    (migration) => migration.name ?? migration.constructor.name,
  );
  return {
    executed,
    pending: known.filter((name) => !executed.includes(name)),
  };
}
