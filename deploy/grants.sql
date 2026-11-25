-- Runtime privileges of the restricted application role. Idempotent; run after every migration.
GRANT USAGE ON SCHEMA public TO carpet_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carpet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carpet_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carpet_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO carpet_app;
