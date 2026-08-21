# PostgreSQL migrations

Run migrations with a dedicated deployment identity that can create and alter objects. The application identity should only receive `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the `pixelboard` schema plus sequence usage if a future migration introduces sequences.

Apply files in lexical order before enabling `Postgres:Enabled`. Do not grant the runtime application role schema-owner or migration privileges.
