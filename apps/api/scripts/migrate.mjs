let dataSource;
try {
  ({ default: dataSource } = await import("../dist/database/data-source.js"));
  await dataSource.initialize();
  const { migrationState } =
    await import("../dist/database/migration-state.js");
  console.log(
    JSON.stringify({ phase: "before", ...(await migrationState(dataSource)) }),
  );
  const applied = await dataSource.runMigrations();
  console.log(
    JSON.stringify({
      phase: "after",
      ...(await migrationState(dataSource)),
      appliedCount: applied.length,
    }),
  );
} catch {
  // TypeORM errors can include SQL, connection options and credentials.
  console.error(
    "Migration failed. Check DB access, TLS, locks and schema compatibility.",
  );
  process.exitCode = 1;
} finally {
  if (dataSource?.isInitialized) {
    try {
      await dataSource.destroy();
    } catch {
      console.error("Migration connection cleanup failed.");
      process.exitCode = 1;
    }
  }
}
