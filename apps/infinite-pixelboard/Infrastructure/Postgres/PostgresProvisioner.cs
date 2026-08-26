using System.Reflection;
using System.Text.RegularExpressions;
using Npgsql;
using PixelBoard.Configuration;

namespace PixelBoard.Infrastructure.Postgres;

public static partial class PostgresProvisioner
{
    private const long AdvisoryLockKey = 578_495_806_987_138_159;
    private const string MigrationResourceMarker = ".Migrations.";

    public static async Task ProvisionAsync(
        IConfiguration configuration,
        CancellationToken cancellationToken = default)
    {
        var connectionString = PostgresConnectionString.Normalize(
            RequiredSetting(
                configuration,
                "PostgresProvisioning:ConnectionString"));
        var runtimeRole = RequiredSetting(
            configuration,
            "PostgresProvisioning:RuntimeRole");
        var runtimePassword = RequiredSetting(
            configuration,
            "PostgresProvisioning:RuntimePassword");

        if (!RuntimeRolePattern().IsMatch(runtimeRole))
        {
            throw new InvalidOperationException(
                "PostgresProvisioning:RuntimeRole must be a lowercase PostgreSQL identifier.");
        }

        if (runtimePassword.Length < 32 || runtimePassword.Any(char.IsControl))
        {
            throw new InvalidOperationException(
                "PostgresProvisioning:RuntimePassword must contain at least 32 non-control characters.");
        }

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await AcquireLockAsync(connection, cancellationToken);

        try
        {
            var (quotedRole, quotedPassword) = await QuoteRoleAsync(
                connection,
                runtimeRole,
                runtimePassword,
                cancellationToken);
            await EnsureRuntimeRoleAsync(
                connection,
                runtimeRole,
                quotedRole,
                quotedPassword,
                cancellationToken);
            await EnsureMigrationLedgerAsync(connection, cancellationToken);

            foreach (var migration in LoadMigrations())
            {
                await ApplyMigrationAsync(connection, migration, cancellationToken);
            }

            await ApplyRuntimeGrantsAsync(connection, quotedRole, cancellationToken);
            Console.WriteLine("Pixelboard PostgreSQL provisioning completed.");
        }
        finally
        {
            await ReleaseLockAsync(connection, cancellationToken);
        }
    }

    private static string RequiredSetting(
        IConfiguration configuration,
        string key)
    {
        var value = configuration[key];
        return string.IsNullOrWhiteSpace(value)
            ? throw new InvalidOperationException($"{key} is required.")
            : value;
    }

    private static async Task AcquireLockAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            "SELECT pg_advisory_lock($1);",
            connection);
        command.Parameters.AddWithValue(AdvisoryLockKey);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task ReleaseLockAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            "SELECT pg_advisory_unlock($1);",
            connection);
        command.Parameters.AddWithValue(AdvisoryLockKey);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<(string Role, string Password)> QuoteRoleAsync(
        NpgsqlConnection connection,
        string runtimeRole,
        string runtimePassword,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            "SELECT quote_ident($1), quote_literal($2);",
            connection);
        command.Parameters.AddWithValue(runtimeRole);
        command.Parameters.AddWithValue(runtimePassword);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return (reader.GetString(0), reader.GetString(1));
    }

    private static async Task EnsureRuntimeRoleAsync(
        NpgsqlConnection connection,
        string runtimeRole,
        string quotedRole,
        string quotedPassword,
        CancellationToken cancellationToken)
    {
        await using var existsCommand = new NpgsqlCommand(
            "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1);",
            connection);
        existsCommand.Parameters.AddWithValue(runtimeRole);
        var exists = (bool)(await existsCommand.ExecuteScalarAsync(cancellationToken)
            ?? false);

        var sql = exists
            ? $"ALTER ROLE {quotedRole} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {quotedPassword};"
            : $"CREATE ROLE {quotedRole} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {quotedPassword};";
        await using var roleCommand = new NpgsqlCommand(sql, connection);
        await roleCommand.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task EnsureMigrationLedgerAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            CREATE SCHEMA IF NOT EXISTS pixelboard;
            CREATE TABLE IF NOT EXISTS pixelboard.schema_migrations (
                migration_name text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            );
            """;
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static IReadOnlyList<Migration> LoadMigrations()
    {
        var assembly = Assembly.GetExecutingAssembly();
        return assembly
            .GetManifestResourceNames()
            .Where(name => name.Contains(
                MigrationResourceMarker,
                StringComparison.Ordinal)
                && name.EndsWith(".sql", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)
            .Select(name =>
            {
                using var stream = assembly.GetManifestResourceStream(name)
                    ?? throw new InvalidOperationException(
                        $"Embedded migration {name} could not be read.");
                using var reader = new StreamReader(stream);
                var migrationName = name[
                    (name.IndexOf(
                        MigrationResourceMarker,
                        StringComparison.Ordinal)
                        + MigrationResourceMarker.Length)..];
                return new Migration(migrationName, reader.ReadToEnd());
            })
            .ToArray();
    }

    private static async Task ApplyMigrationAsync(
        NpgsqlConnection connection,
        Migration migration,
        CancellationToken cancellationToken)
    {
        await using var transaction = await connection.BeginTransactionAsync(
            cancellationToken);
        await using var existsCommand = new NpgsqlCommand(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.schema_migrations
                WHERE migration_name = $1);
            """,
            connection,
            transaction);
        existsCommand.Parameters.AddWithValue(migration.Name);
        var exists = (bool)(await existsCommand.ExecuteScalarAsync(cancellationToken)
            ?? false);
        if (exists)
        {
            await transaction.CommitAsync(cancellationToken);
            return;
        }

        await using var migrationCommand = new NpgsqlCommand(
            migration.Sql,
            connection,
            transaction);
        await migrationCommand.ExecuteNonQueryAsync(cancellationToken);

        await using var recordCommand = new NpgsqlCommand(
            """
            INSERT INTO pixelboard.schema_migrations (migration_name)
            VALUES ($1);
            """,
            connection,
            transaction);
        recordCommand.Parameters.AddWithValue(migration.Name);
        await recordCommand.ExecuteNonQueryAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        Console.WriteLine($"Applied {migration.Name}.");
    }

    private static async Task ApplyRuntimeGrantsAsync(
        NpgsqlConnection connection,
        string quotedRole,
        CancellationToken cancellationToken)
    {
        await using var databaseCommand = new NpgsqlCommand(
            "SELECT quote_ident(current_database());",
            connection);
        var quotedDatabase = (string)(await databaseCommand.ExecuteScalarAsync(
            cancellationToken)
            ?? throw new InvalidOperationException(
                "The current PostgreSQL database could not be identified."));

        var sql =
            $"""
            GRANT CONNECT ON DATABASE {quotedDatabase} TO {quotedRole};
            REVOKE ALL ON SCHEMA pixelboard FROM PUBLIC;
            GRANT USAGE ON SCHEMA pixelboard TO {quotedRole};
            GRANT SELECT, INSERT, UPDATE, DELETE
                ON ALL TABLES IN SCHEMA pixelboard TO {quotedRole};
            GRANT USAGE, SELECT
                ON ALL SEQUENCES IN SCHEMA pixelboard TO {quotedRole};
            ALTER DEFAULT PRIVILEGES IN SCHEMA pixelboard
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {quotedRole};
            ALTER DEFAULT PRIVILEGES IN SCHEMA pixelboard
                GRANT USAGE, SELECT ON SEQUENCES TO {quotedRole};
            REVOKE ALL ON pixelboard.schema_migrations FROM {quotedRole};
            """;
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private sealed record Migration(string Name, string Sql);

    [GeneratedRegex("^[a-z][a-z0-9_]{2,62}$", RegexOptions.CultureInvariant)]
    private static partial Regex RuntimeRolePattern();
}
