let dataSource;
let migration;
try {
  ({ default: dataSource } = await import("../dist/database/data-source.js"));
  await dataSource.initialize();
  for (const item of dataSource.migrations) {
    const up = item.up.bind(item);
    item.up = async (runner) => {
      migration = item.name ?? item.constructor.name;
      await up(runner);
      migration = undefined;
    };
  }
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
} catch (error) {
  // TypeORM errors can include SQL, connection options and credentials.
  const code = error?.driverError?.code ?? error?.code;
  console.error(
    JSON.stringify({
      phase: "migration",
      result: "FAILED",
      code:
        typeof code === "string" &&
        (/^[0-9A-Z]{5}$/.test(code) ||
          [
            "ECONNREFUSED",
            "ENOTFOUND",
            "ETIMEDOUT",
            "ERR_TLS_CERT_ALTNAME_INVALID",
            "DEPTH_ZERO_SELF_SIGNED_CERT",
          ].includes(code))
          ? code
          : "DB_ERROR",
      migration:
        typeof migration === "string" &&
        /^[A-Za-z][A-Za-z0-9]{0,120}$/.test(migration)
          ? migration
          : undefined,
    }),
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
