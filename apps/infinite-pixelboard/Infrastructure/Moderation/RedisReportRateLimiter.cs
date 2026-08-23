using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using StackExchange.Redis;

namespace PixelBoard.Infrastructure.Moderation;

public sealed class RedisReportRateLimiter(
    IConnectionMultiplexer redis,
    IOptions<RedisOptions> options) : IReportRateLimiter
{
    public const int MaxReportsPerWindow = 5;
    public static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan DuplicateWindow = TimeSpan.FromHours(1);

    private const string AcquireScript =
        """
        local now = tonumber(ARGV[1])
        local window_start = now - tonumber(ARGV[2])
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', window_start)

        if redis.call('EXISTS', KEYS[2]) == 1 then
            return 1
        end

        if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
            return 2
        end

        redis.call('ZADD', KEYS[1], now, ARGV[4])
        redis.call('PEXPIRE', KEYS[1], ARGV[2])
        redis.call('SET', KEYS[2], ARGV[4], 'PX', ARGV[5])
        return 0
        """;

    private const string ReleaseScript =
        """
        if redis.call('GET', KEYS[2]) == ARGV[1] then
            redis.call('DEL', KEYS[2])
        end
        redis.call('ZREM', KEYS[1], ARGV[1])
        return 0
        """;

    private readonly RedisOptions _options = options.Value;

    public async ValueTask<ReportAdmissionOutcome> TryAcquireAsync(
        ReportCommand command,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var database = redis.GetDatabase();
        var result = (int)await database.ScriptEvaluateAsync(
            AcquireScript,
            [
                RateKey(command.ReporterAccountId),
                DuplicateKey(command)
            ],
            [
                command.SubmittedAt.ToUnixTimeMilliseconds(),
                (long)RateLimitWindow.TotalMilliseconds,
                MaxReportsPerWindow,
                command.ReportId.Value.ToString("N"),
                (long)DuplicateWindow.TotalMilliseconds
            ]);

        return result switch
        {
            0 => ReportAdmissionOutcome.Allowed,
            1 => ReportAdmissionOutcome.Duplicate,
            _ => ReportAdmissionOutcome.RateLimited
        };
    }

    public async ValueTask ReleaseAsync(
        ReportCommand command,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await redis.GetDatabase().ScriptEvaluateAsync(
            ReleaseScript,
            [RateKey(command.ReporterAccountId), DuplicateKey(command)],
            [command.ReportId.Value.ToString("N")]);
    }

    private RedisKey RateKey(AccountId accountId) =>
        $"{_options.InstanceName}ReportRate:{Hash(accountId.Value)}";

    private RedisKey DuplicateKey(ReportCommand command)
    {
        var fingerprint =
            $"{command.ReporterAccountId.Value}\0{command.Region.Top}\0{command.Region.Left}\0" +
            $"{command.Region.Width}\0{command.Region.Height}\0{command.Reason}";
        return $"{_options.InstanceName}ReportDuplicate:{Hash(fingerprint)}";
    }

    internal static byte[] DeduplicationHash(ReportCommand command) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(
            $"{command.ReporterAccountId.Value}\0{command.Region.Top}\0{command.Region.Left}\0" +
            $"{command.Region.Width}\0{command.Region.Height}\0{command.Reason}"));

    private static string Hash(string value) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
