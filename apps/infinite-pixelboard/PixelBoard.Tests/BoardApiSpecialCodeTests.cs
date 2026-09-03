using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class BoardApiSpecialCodeTests
{
    [Fact]
    public async Task RedeemSpecialCodeGrantedReturnsNoContent()
    {
        await using var services = CreateServices(SpecialCodeClaimOutcome.Granted);
        var result = await BoardApi.RedeemSpecialCodeAsync(
            new RedeemSpecialCodeRequest("PARTY24"),
            new IdentityAccessor(),
            services,
            CancellationToken.None);

        Assert.IsType<NoContent>(result);
    }

    [Theory]
    [InlineData(SpecialCodeClaimOutcome.InvalidCode, 400, ApiErrorCodes.InvalidSpecialCode)]
    [InlineData(SpecialCodeClaimOutcome.NotSpecialCode, 400, ApiErrorCodes.InvalidSpecialCode)]
    [InlineData(SpecialCodeClaimOutcome.AlreadyRedeemed, 409, ApiErrorCodes.SpecialCodeAlreadyRedeemed)]
    [InlineData(SpecialCodeClaimOutcome.CodeExpired, 410, ApiErrorCodes.SpecialCodeExpired)]
    [InlineData(SpecialCodeClaimOutcome.BenefitExpired, 410, ApiErrorCodes.SpecialCodeExpired)]
    [InlineData(SpecialCodeClaimOutcome.CommunityStandardsRequired, 403, ApiErrorCodes.CommunityStandardsRequired)]
    [InlineData(SpecialCodeClaimOutcome.AccountDeleted, 410, ApiErrorCodes.AccountDeleted)]
    public async Task RedeemSpecialCodeMapsOutcomes(
        SpecialCodeClaimOutcome outcome,
        int statusCode,
        string errorCode)
    {
        await using var services = CreateServices(outcome);
        var result = await BoardApi.RedeemSpecialCodeAsync(
            new RedeemSpecialCodeRequest("PARTY24"),
            new IdentityAccessor(),
            services,
            CancellationToken.None);

        var json = Assert.IsType<JsonHttpResult<ApiError>>(result);
        Assert.Equal(statusCode, json.StatusCode);
        Assert.Equal(errorCode, json.Value?.Code);
    }

    private static ServiceProvider CreateServices(SpecialCodeClaimOutcome outcome) =>
        new ServiceCollection()
            .AddSingleton<ISpecialCodeService>(new SpecialCodeService(outcome))
            .BuildServiceProvider();

    private sealed class IdentityAccessor : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(new AccountId("user-1"), false, true));
    }

    private sealed class SpecialCodeService(SpecialCodeClaimOutcome outcome) : ISpecialCodeService
    {
        public ValueTask<SpecialCodeClaimOutcome> RedeemAsync(
            AccountId accountId,
            string? code,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(outcome);

        public ValueTask<SpecialCodeCreateResult> CreateAsync(
            AccountId actorAccountId,
            CreateSpecialCodeCommand command,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(
                new SpecialCodeCreateResult(SpecialCodeCreateOutcome.InvalidRequest));
    }
}
