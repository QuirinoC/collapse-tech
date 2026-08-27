using Npgsql;

namespace PixelBoard.Infrastructure.Postgres;

internal static class PostgresAccountLock
{
    public static async ValueTask AcquireAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        byte[] accountHash,
        CancellationToken cancellationToken)
    {
        const string sql =
            "SELECT pg_advisory_xact_lock(hashtextextended(encode($1, 'hex'), 0));";
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(accountHash);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
