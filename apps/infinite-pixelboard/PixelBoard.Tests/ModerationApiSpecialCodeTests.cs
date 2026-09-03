using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class ModerationApiSpecialCodeTests
{
    [Fact]
    public async Task CreateSpecialCodeReturnsCreatedPayload()
    {
        var createdAt = new DateTimeOffset(2026, 9, 2, 12, 0, 0, TimeSpan.Zero);
        var expiresAt = createdAt.AddDays(7);
        await using var services = CreateServices(
            new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.Created,
                new SpecialCodeDefinition(
                    "UNLIMIT1",
                    0,
                    expiresAt,
                    null,
                    expiresAt,
                    "Launch party",
                    createdAt)));

        var result = await ModerationApi.CreateSpecialCodeAsync(
            new CreateSpecialCodeRequest(
                "UNLIMIT1",
                0,
                expiresAt,
                null,
                expiresAt,
                "Launch party"),
            new ModeratorIdentityAccessor(),
            services,
            CancellationToken.None);

        var json = Assert.IsType<JsonHttpResult<SpecialCodeResponse>>(result);
        Assert.Equal(201, json.StatusCode);
        Assert.Equal("UNLIMIT1", json.Value?.Code);
        Assert.Equal(0, json.Value?.CooldownSeconds);
    }

    [Fact]
    public async Task CreateSpecialCodeConflictReturnsDuplicate()
    {
        await using var services = CreateServices(
            new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.CodeConflict,
                ErrorMessage: "That special code already exists."));

        var result = await ModerationApi.CreateSpecialCodeAsync(
            new CreateSpecialCodeRequest("UNLIMIT1", 0, null, 3600, null, null),
            new ModeratorIdentityAccessor(),
            services,
            CancellationToken.None);

        var json = Assert.IsType<JsonHttpResult<ApiError>>(result);
        Assert.Equal(409, json.StatusCode);
        Assert.Equal(ApiErrorCodes.SpecialCodeDuplicate, json.Value?.Code);
    }

    private static ServiceProvider CreateServices(SpecialCodeCreateResult createResult) =>
        new ServiceCollection()
            .AddSingleton<ISpecialCodeService>(new SpecialCodeService(createResult))
            .AddSingleton<IAccountOperationGuard>(new AlwaysActiveGuard())
            .BuildServiceProvider();

    private sealed class ModeratorIdentityAccessor : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(new AccountId("moderator"), false, true));
    }

    private sealed class AlwaysActiveGuard : IAccountOperationGuard
    {
        public ValueTask<IAsyncDisposable?> AcquireIfActiveAsync(
            IReadOnlyCollection<AccountId> accountIds,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<IAsyncDisposable?>(new Noop());

        private sealed class Noop : IAsyncDisposable
        {
            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }

    private sealed class SpecialCodeService(SpecialCodeCreateResult createResult) : ISpecialCodeService
    {
        public ValueTask<SpecialCodeClaimOutcome> RedeemAsync(
            AccountId accountId,
            string? code,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(SpecialCodeClaimOutcome.InvalidCode);

        public ValueTask<SpecialCodeCreateResult> CreateAsync(
            AccountId actorAccountId,
            CreateSpecialCodeCommand command,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(createResult);
    }
}
