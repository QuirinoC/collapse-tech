using Npgsql;
using PixelBoard.Application;
using PixelBoard.Infrastructure.Notifications;

namespace PixelBoard.Tests;

public sealed class PostgresNotificationStoreIntegrationTests
{
    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task CreateCampaignQueuesOutboxRowsWithNullableDedupeIndex()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var store = new PostgresNotificationStore(dataSource);
        var moderator = new AccountId($"notification-test-moderator-{Guid.NewGuid():N}");
        var recipients = new[]
        {
            new AccountId($"notification-test-recipient-{Guid.NewGuid():N}"),
            new AccountId($"notification-test-recipient-{Guid.NewGuid():N}")
        };

        var campaign = await store.CreateCampaignAsync(
            moderator,
            "Integration test campaign",
            "This notification is for an integration test.",
            recipients,
            null);

        await using var countCommand = dataSource.CreateCommand(
            """
            SELECT count(*)
            FROM pixelboard.notification_outbox
            WHERE campaign_id = @campaign_id
              AND dedupe_key IS NOT NULL;
            """);
        countCommand.Parameters.AddWithValue("campaign_id", campaign.CampaignId);

        Assert.Equal(
            2L,
            (long)(await countCommand.ExecuteScalarAsync() ?? 0L));

        await using var cleanup = dataSource.CreateCommand(
            """
            DELETE FROM pixelboard.notification_outbox
            WHERE campaign_id = @campaign_id;
            DELETE FROM pixelboard.notification_campaigns
            WHERE campaign_id = @campaign_id;
            """);
        cleanup.Parameters.AddWithValue("campaign_id", campaign.CampaignId);
        await cleanup.ExecuteNonQueryAsync();
    }
}
