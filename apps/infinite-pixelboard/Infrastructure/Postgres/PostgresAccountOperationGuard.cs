using System.Security.Cryptography;
using System.Text;
using Npgsql;
using PixelBoard.Application;

namespace PixelBoard.Infrastructure.Postgres;

public sealed class PostgresAccountOperationGuard(NpgsqlDataSource dataSource)
    : IAccountOperationGuard
{
    public async ValueTask<IAsyncDisposable?> AcquireIfActiveAsync(
        IReadOnlyCollection<AccountId> accountIds,
        CancellationToken cancellationToken = default)
    {
        var hashes = accountIds
            .Select(account => SHA256.HashData(Encoding.UTF8.GetBytes(account.Value)))
            .Distinct(ByteArrayComparer.Instance)
            .OrderBy(Convert.ToHexString, StringComparer.Ordinal)
            .ToArray();
        if (hashes.Length == 0)
        {
            throw new ArgumentException(
                "At least one account is required.",
                nameof(accountIds));
        }

        var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        NpgsqlTransaction transaction;
        try
        {
            transaction = await connection.BeginTransactionAsync(cancellationToken);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }

        try
        {
            foreach (var hash in hashes)
            {
                await PostgresAccountLock.AcquireAsync(
                    connection,
                    transaction,
                    hash,
                    cancellationToken);
            }

            const string sql =
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pixelboard.deleted_accounts
                    WHERE account_hash = ANY($1)
                );
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue(hashes);
            var deleted = (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
            if (deleted)
            {
                await transaction.DisposeAsync();
                await connection.DisposeAsync();
                return null;
            }

            return new Lease(connection, transaction);
        }
        catch
        {
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
            throw;
        }
    }

    private sealed class Lease(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
        }
    }

    private sealed class ByteArrayComparer : IEqualityComparer<byte[]>
    {
        public static ByteArrayComparer Instance { get; } = new();

        public bool Equals(byte[]? left, byte[]? right) =>
            left is not null && right is not null && left.AsSpan().SequenceEqual(right);

        public int GetHashCode(byte[] value)
        {
            var hash = new HashCode();
            foreach (var item in value)
            {
                hash.Add(item);
            }
            return hash.ToHashCode();
        }
    }
}
