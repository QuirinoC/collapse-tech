# PostgreSQL migrations

Run migrations with a dedicated deployment identity that can create and alter objects. The application identity should only receive `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the `pixelboard` schema plus sequence usage if a future migration introduces sequences.

Apply files in lexical order before enabling `Postgres:Enabled`. Do not grant the runtime application role schema-owner or migration privileges.

The production image includes a repeatable provisioning command that applies
the embedded migrations, creates or rotates a restricted runtime role, and
grants that role DML access only:

```bash
PostgresProvisioning__ConnectionString='postgresql://migration-owner:...' \
PostgresProvisioning__RuntimeRole='pixelboard_runtime' \
PostgresProvisioning__RuntimePassword='at-least-32-random-characters' \
dotnet PixelBoard.dll --provision-postgres
```

Run it as a one-off job with the migration-owner connection, then remove the
three provisioning variables. Configure the web service with
`Postgres__Enabled=true` and a `Postgres__ConnectionString` that uses the
restricted runtime role. The command records each applied migration in
`pixelboard.schema_migrations` and is safe to rerun.
