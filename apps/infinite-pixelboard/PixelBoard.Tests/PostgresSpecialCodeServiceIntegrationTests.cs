using Npgsql;
using PixelBoard.Application;
using PixelBoard.Infrastructure.Postgres;

namespace PixelBoard.Tests;

public sealed class PostgresSpecialCodeServiceIntegrationTests
{
    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task ReferralOnceSpecialAfterReferralAndDoubleRedeemRules()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var time = new FakeTimeProvider(
            new DateTimeOffset(2026, 9, 2, 18, 0, 0, TimeSpan.Zero));
        var referrals = new PostgresReferralService(dataSource, time);
        var specials = new PostgresSpecialCodeService(dataSource, time);

        var referrer = new AccountId($"special-ref-{Guid.NewGuid():N}");
        var referee = new AccountId($"special-user-{Guid.NewGuid():N}");
        await EnsureAccountAsync(dataSource, referrer);
        await EnsureAccountAsync(dataSource, referee);

        var invite = await referrals.GetOrCreateCodeAsync(referrer);
        Assert.False(string.IsNullOrWhiteSpace(invite));
        Assert.Equal(
            ReferralClaimOutcome.Granted,
            await referrals.ClaimAsync(referee, invite));
        Assert.Equal(
            ReferralClaimOutcome.AlreadyClaimed,
            await referrals.ClaimAsync(referee, invite));

        var benefitEnds = time.GetUtcNow().AddHours(2);
        var create = await specials.CreateAsync(
            referrer,
            new CreateSpecialCodeCommand(
                $"SP{Guid.NewGuid():N}"[..8].ToUpperInvariant().Replace('0', '2').Replace('1', '3'),
                0,
                benefitEnds,
                null,
                benefitEnds,
                "integration"));
        Assert.Equal(SpecialCodeCreateOutcome.Created, create.Outcome);
        var code = create.Code!.Code;

        Assert.Equal(
            SpecialCodeClaimOutcome.Granted,
            await specials.RedeemAsync(referee, code));
        Assert.Equal(
            SpecialCodeClaimOutcome.AlreadyRedeemed,
            await specials.RedeemAsync(referee, code));

        var boost = await referrals.GetAsync(referee);
        Assert.NotNull(boost);
        Assert.Equal(0, boost!.CooldownSeconds);
        Assert.Equal(0, PlacementCooldown.Resolve(Contracts.V1.AccountTier.Free, boost, time.GetUtcNow()));

        time.Advance(TimeSpan.FromHours(3));
        var expired = await referrals.GetAsync(referee);
        Assert.Null(expired);
        Assert.Equal(
            PlacementCooldown.FreeSeconds,
            PlacementCooldown.Resolve(Contracts.V1.AccountTier.Free, expired, time.GetUtcNow()));

        await CleanupAsync(dataSource, referrer, referee, code);
    }

    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task ExpiredSpecialCodeIsRejected()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var now = new DateTimeOffset(2026, 9, 2, 18, 0, 0, TimeSpan.Zero);
        var time = new FakeTimeProvider(now);
        var specials = new PostgresSpecialCodeService(dataSource, time);
        var user = new AccountId($"special-exp-{Guid.NewGuid():N}");
        await EnsureAccountAsync(dataSource, user);

        var code = $"EX{Guid.NewGuid():N}"[..8].ToUpperInvariant().Replace('0', '2').Replace('1', '3');
        var create = await specials.CreateAsync(
            user,
            new CreateSpecialCodeCommand(
                code,
                1,
                now.AddMinutes(30),
                3600,
                null,
                "expires soon"));
        Assert.Equal(SpecialCodeCreateOutcome.Created, create.Outcome);

        time.Advance(TimeSpan.FromHours(1));
        Assert.Equal(
            SpecialCodeClaimOutcome.CodeExpired,
            await specials.RedeemAsync(user, code));

        await CleanupAsync(dataSource, user, user, code);
    }

    private static async Task EnsureAccountAsync(
        NpgsqlDataSource dataSource,
        AccountId accountId)
    {
        const string sql =
            """
            INSERT INTO pixelboard.accounts (
                firebase_uid,
                community_standards_version,
                community_standards_accepted_at,
                updated_at)
            VALUES ($1, '2026-08-21', now(), now())
            ON CONFLICT (firebase_uid) DO NOTHING;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task CleanupAsync(
        NpgsqlDataSource dataSource,
        AccountId first,
        AccountId second,
        string code)
    {
        await using var command = dataSource.CreateCommand(
            """
            DELETE FROM pixelboard.special_code_redemptions WHERE code = $1;
            DELETE FROM pixelboard.special_codes WHERE code = $1;
            DELETE FROM pixelboard.paint_boosts WHERE firebase_uid = ANY($2);
            DELETE FROM pixelboard.referral_attributions
            WHERE referee_firebase_uid = ANY($2) OR referrer_firebase_uid = ANY($2);
            DELETE FROM pixelboard.referral_codes WHERE firebase_uid = ANY($2);
            DELETE FROM pixelboard.accounts WHERE firebase_uid = ANY($2);
            """);
        command.Parameters.AddWithValue(code);
        command.Parameters.AddWithValue(new[] { first.Value, second.Value });
        await command.ExecuteNonQueryAsync();
    }

    private sealed class FakeTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan delta) => _now += delta;
    }
}
