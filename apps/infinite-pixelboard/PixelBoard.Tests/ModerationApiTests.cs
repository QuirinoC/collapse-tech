using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Moderation;

namespace PixelBoard.Tests;

public sealed class ModerationApiTests
{
    public static TheoryData<ModerationActionRequest?> InvalidActions => new()
    {
        null,
        new("delete", "reason", ValidKey(), null, null, null, null),
        new("dismiss", "reason", ValidKey(), null, null, null, null),
        new("ban", "reason", ValidKey(), null, null, null, null),
        new(
            "suspend",
            "reason",
            ValidKey(),
            null,
            "target-account",
            null,
            DateTimeOffset.UnixEpoch),
        new("rollback", "reason", ValidKey(), null, null, [], null),
        new("warn", "reason", "short", null, "target-account", null, null),
    };

    [Theory]
    [MemberData(nameof(InvalidActions))]
    public async Task InvalidActionReturnsStructuredErrorWithoutExecuting(
        ModerationActionRequest? request)
    {
        var moderation = new RecordingModerationService();
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IModerationService>(moderation)
            .BuildServiceProvider();

        var result = await ModerationApi.ExecuteActionAsync(
            request,
            new ModeratorIdentityAccessor(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal(ApiErrorCodes.InvalidModerationAction, response.Body.Code);
        Assert.Equal(0, moderation.ExecutionCount);
    }

    [Theory]
    [InlineData("", "valid-idempotency-key")]
    [InlineData("reason", "short")]
    [InlineData("reason", "invalid key with spaces")]
    public async Task InvalidSafetyUpdateReturnsStructuredErrorWithoutExecuting(
        string reason,
        string idempotencyKey)
    {
        var moderation = new RecordingModerationService();
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IModerationService>(moderation)
            .BuildServiceProvider();

        var result = await ModerationApi.SetSafetyStateAsync(
            new SafetyStateRequest(true, true, reason, idempotencyKey),
            new ModeratorIdentityAccessor(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal(ApiErrorCodes.InvalidModerationAction, response.Body.Code);
        Assert.Equal(0, moderation.ExecutionCount);
    }

    [Fact]
    public async Task DeletedModeratorFailureReturnsGone()
    {
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IModerationService>(
                new RecordingModerationService(throwDeleted: true))
            .BuildServiceProvider();

        var result = await ModerationApi.SetSafetyStateAsync(
            new SafetyStateRequest(true, true, "Emergency", ValidKey()),
            new ModeratorIdentityAccessor(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status410Gone, response.StatusCode);
        Assert.Equal(ApiErrorCodes.AccountDeleted, response.Body.Code);
    }

    [Fact]
    public async Task DeletedModeratorCannotReadPrivateReports()
    {
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IModerationService>(new RecordingModerationService())
            .AddSingleton<IAccountOperationGuard>(new StubAccountOperationGuard())
            .BuildServiceProvider();

        var result = await ModerationApi.ListReportsAsync(
            null,
            new ModeratorIdentityAccessor(),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status410Gone, response.StatusCode);
        Assert.Equal(ApiErrorCodes.AccountDeleted, response.Body.Code);
    }

    private static string ValidKey() => "valid-idempotency-key";

    private static async Task<(int StatusCode, T Body)> ExecuteAsync<T>(
        IResult result,
        IServiceProvider services)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = services,
            Response = { Body = new MemoryStream() }
        };
        await result.ExecuteAsync(context);
        context.Response.Body.Position = 0;
        var body = await JsonSerializer.DeserializeAsync<T>(
            context.Response.Body,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return (context.Response.StatusCode, Assert.IsType<T>(body));
    }

    private sealed class ModeratorIdentityAccessor : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(new AccountId("moderator"), false, true));
    }

    private sealed class StubAccountOperationGuard : IAccountOperationGuard
    {
        public ValueTask<IAsyncDisposable?> AcquireIfActiveAsync(
            IReadOnlyCollection<AccountId> accountIds,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<IAsyncDisposable?>(null);
    }

    private sealed class RecordingModerationService(bool throwDeleted = false) : IModerationService
    {
        public int ExecutionCount { get; private set; }

        public ValueTask<IReadOnlyList<ModerationReport>> ListReportsAsync(
            int limit,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<IReadOnlyList<ModerationReport>>([]);

        public ValueTask<ModerationReport?> GetReportAsync(
            ReportId reportId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<ModerationReport?>(null);

        public ValueTask<ModerationActionResult> ExecuteAsync(
            ModerationActionCommand command,
            CancellationToken cancellationToken = default)
        {
            ExecutionCount++;
            throw new InvalidOperationException("Invalid actions must not execute.");
        }

        public ValueTask<ModerationActionResult> SetSafetyStateAsync(
            ModerationActionCommand command,
            PlatformSafetyState state,
            CancellationToken cancellationToken = default)
        {
            if (throwDeleted)
            {
                throw new ModerationAccountDeletedException();
            }
            ExecutionCount++;
            throw new InvalidOperationException("Invalid updates must not execute.");
        }

        public ValueTask<PlatformSafetyState> GetStateAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(new PlatformSafetyState(false, true));

        public ValueTask<bool> IsVisibleAsync(
            BoardPosition position,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(true);

        public ValueTask ApplyAsync(
            TileAddress tile,
            string[][] pixels,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }

}
