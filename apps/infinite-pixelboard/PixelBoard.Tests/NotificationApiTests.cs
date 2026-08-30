using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Notifications;

namespace PixelBoard.Tests;

public sealed class NotificationApiTests
{
    [Fact]
    public async Task RegisterDeviceRejectsAnotherBundleId()
    {
        var store = new RecordingNotificationStore();
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<INotificationStore>(store)
            .BuildServiceProvider();

        var result = await NotificationApi.RegisterDeviceAsync(
            new PushDeviceRequest(
                Guid.NewGuid().ToString(),
                "apns-token",
                "production",
                "com.example.other"),
            new IdentityAccessor(),
            Options.Create(new ApnsOptions
            {
                Enabled = true,
                BundleId = "com.collapsetechnologies.pixelboard"
            }),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal(0, store.RegisteredDevices);
    }

    [Fact]
    public async Task CampaignIsQueuedForSelectedRecipients()
    {
        var store = new RecordingNotificationStore();
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<INotificationStore>(store)
            .BuildServiceProvider();

        var result = await NotificationApi.CreateCampaignAsync(
            new NotificationCampaignRequest(
                "Limits lifted",
                "Psssttt — limits are lifted for six hours.",
                ["user-a", "user-b", "user-a"],
                DateTimeOffset.UtcNow.AddHours(6)),
            new IdentityAccessor(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<NotificationCampaign>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal(2, store.CampaignRecipients);
    }

    [Fact]
    public async Task CampaignWithNullFieldsReturnsBadRequest()
    {
        var store = new RecordingNotificationStore();
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<INotificationStore>(store)
            .BuildServiceProvider();

        var result = await NotificationApi.CreateCampaignAsync(
            new NotificationCampaignRequest(null, null, null, null),
            new IdentityAccessor(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal("invalid_notification_campaign", response.Body.Code);
        Assert.Equal(0, store.CampaignRecipients);
    }

    [Fact]
    public async Task CampaignWithBlankRecipientReturnsBadRequest()
    {
        var store = new RecordingNotificationStore();
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<INotificationStore>(store)
            .BuildServiceProvider();

        var result = await NotificationApi.CreateCampaignAsync(
            new NotificationCampaignRequest(
                "Limits lifted",
                "Psssttt — limits are lifted.",
                ["", "  "],
                null),
            new IdentityAccessor(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal("invalid_notification_campaign", response.Body.Code);
        Assert.Equal(0, store.CampaignRecipients);
    }

    [Fact]
    public async Task CampaignStoreFailureReturnsServiceUnavailable()
    {
        var store = new RecordingNotificationStore
        {
            CampaignFailure = new NpgsqlException("notification schema unavailable")
        };
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<INotificationStore>(store)
            .BuildServiceProvider();

        var result = await NotificationApi.CreateCampaignAsync(
            new NotificationCampaignRequest(
                "Limits lifted",
                "Psssttt — limits are lifted.",
                ["user-a"],
                null),
            new IdentityAccessor(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, response.StatusCode);
        Assert.Equal(ApiErrorCodes.ServiceUnavailable, response.Body.Code);
        Assert.DoesNotContain("schema", response.Body.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<(int StatusCode, T Body)> ExecuteAsync<T>(
        IResult result,
        IServiceProvider services)
    {
        var context = new DefaultHttpContext { RequestServices = services };
        await using var body = new MemoryStream();
        context.Response.Body = body;
        await result.ExecuteAsync(context);
        body.Position = 0;
        var value = await JsonSerializer.DeserializeAsync<T>(
                body,
                new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("The response body was empty.");
        return (context.Response.StatusCode, value);
    }

    private sealed class IdentityAccessor : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(new AccountId("moderator"), false, true));
    }

    private sealed class RecordingNotificationStore : INotificationStore
    {
        public int RegisteredDevices { get; private set; }
        public int CampaignRecipients { get; private set; }
        public Exception? CampaignFailure { get; init; }

        public ValueTask RegisterDeviceAsync(
            AccountId accountId,
            PushDeviceRegistration registration,
            CancellationToken cancellationToken = default)
        {
            RegisteredDevices++;
            return ValueTask.CompletedTask;
        }

        public ValueTask RemoveDeviceAsync(
            AccountId accountId,
            Guid installationId,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public ValueTask<NotificationCampaign> CreateCampaignAsync(
            AccountId moderatorAccountId,
            string title,
            string body,
            IReadOnlyCollection<AccountId> recipients,
            DateTimeOffset? expiresAt,
            CancellationToken cancellationToken = default)
        {
            if (CampaignFailure is { } exception)
            {
                throw exception;
            }
            CampaignRecipients = recipients.Count;
            return ValueTask.FromResult(new NotificationCampaign(
                Guid.NewGuid(),
                title,
                body,
                expiresAt,
                recipients.Count,
                DateTimeOffset.UtcNow));
        }

        public ValueTask<NotificationOutboxItem?> ClaimNextAsync(
            string workerId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<NotificationOutboxItem?>(null);

        public ValueTask<IReadOnlyList<PushDeviceRegistration>> GetActiveDevicesAsync(
            string firebaseUid,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<IReadOnlyList<PushDeviceRegistration>>([]);

        public ValueTask MarkSentAsync(
            Guid notificationId,
            string workerId,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public ValueTask RescheduleAsync(
            Guid notificationId,
            string workerId,
            string error,
            TimeSpan delay,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public ValueTask InvalidateDeviceAsync(
            Guid installationId,
            string token,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public ValueTask DeleteAccountAsync(
            string firebaseUid,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }
}
