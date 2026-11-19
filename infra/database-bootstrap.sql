-- One-time operator bootstrap in database chongmuya, NOT part of deployment.
-- Connect as chongmuyaadmin, with DB/public-schema grant authority. Existing
-- passwords/owners are unchanged. This administrator also needs SET membership:
--   SELECT pg_has_role(current_user, 'chongmuya_migrator', 'SET');
-- Only if false, a role administrator with ADMIN OPTION (RDS: rds_superuser)
-- grants once: GRANT chongmuya_migrator TO chongmuyaadmin WITH SET TRUE;
-- CREATEROLE alone is not enough. Missing roles require separate membership
-- preparation; this transaction fails closed rather than escalating its caller.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'chongmuya' THEN RAISE EXCEPTION 'Wrong database'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chongmuya_app') THEN
    CREATE ROLE chongmuya_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chongmuya_migrator') THEN
    CREATE ROLE chongmuya_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('chongmuya_app','chongmuya_migrator') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)) THEN
    RAISE EXCEPTION 'Review existing privileged roles before bootstrap';
  END IF;
END $$;
REVOKE CREATE, TEMPORARY ON DATABASE chongmuya FROM PUBLIC, chongmuya_app;
GRANT CONNECT ON DATABASE chongmuya TO chongmuya_app, chongmuya_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, chongmuya_app;
GRANT USAGE ON SCHEMA public TO chongmuya_app;
GRANT USAGE, CREATE ON SCHEMA public TO chongmuya_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chongmuya_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chongmuya_app;
SET LOCAL ROLE chongmuya_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chongmuya_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO chongmuya_app;
RESET ROLE;
COMMIT;
