using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class BoardApiReportTests
{
    [Fact]
    public async Task AcceptedReportReturnsOnlyStablePublicMetadata()
    {
        var services = CreateServices(new AccountPolicyState(false, true));
        await using var provider = services.Provider;

        var result = await BoardApi.ReportAsync(
            ValidRequest(),
            new IdentityAccessor(),
            new ReportValidator(),
            TimeProvider.System,
            provider,
            CancellationToken.None);
        var response = await ExecuteAsync<ReportResponse>(result, provider);
        var json = JsonSerializer.Serialize(response.Body);

        Assert.Equal(StatusCodes.Status201Created, response.StatusCode);
        Assert.Equal(ReportStatus.Received, response.Body.Status);
        Assert.DoesNotContain("firebase", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("uid", json, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, services.Store.SavedCount);
    }

    [Fact]
    public async Task DurableBanIsCheckedBeforeAdmission()
    {
        var services = CreateServices(new AccountPolicyState(true, true));
        await using var provider = services.Provider;

        var result = await BoardApi.ReportAsync(
            ValidRequest(),
            new IdentityAccessor(),
            new ReportValidator(),
            TimeProvider.System,
            provider,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, provider);

        Assert.Equal(StatusCodes.Status403Forbidden, response.StatusCode);
        Assert.Equal(ApiErrorCodes.AccountBanned, response.Body.Code);
        Assert.Equal(0, services.Limiter.CallCount);
        Assert.Equal(0, services.Store.SavedCount);
    }

    [Theory]
    [InlineData(ReportAdmissionOutcome.Duplicate, 409, ApiErrorCodes.DuplicateRequest)]
    [InlineData(ReportAdmissionOutcome.RateLimited, 429, ApiErrorCodes.ReportRateLimited)]
    public async Task AdmissionRejectionsUseStructuredErrors(
        ReportAdmissionOutcome outcome,
        int expectedStatus,
        string expectedCode)
    {
        var services = CreateServices(new AccountPolicyState(false, true), outcome);
        await using var provider = services.Provider;

        var result = await BoardApi.ReportAsync(
            ValidRequest(),
            new IdentityAccessor(),
            new ReportValidator(),
            TimeProvider.System,
            provider,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, provider);

        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Equal(expectedCode, response.Body.Code);
        Assert.Equal(0, services.Store.SavedCount);
    }

    [Fact]
    public async Task PersistenceFailureReleasesAdmissionForSafeRetry()
    {
        var services = CreateServices(
            new AccountPolicyState(false, true),
            storeFailure: new InvalidOperationException("database unavailable"));
        await using var provider = services.Provider;

        await Assert.ThrowsAsync<InvalidOperationException>(() => BoardApi.ReportAsync(
            ValidRequest(),
            new IdentityAccessor(),
            new ReportValidator(),
            TimeProvider.System,
            provider,
            CancellationToken.None));

        Assert.Equal(1, services.Limiter.ReleaseCount);
    }

    private static CreateReportRequest ValidRequest() =>
        new(
            new ReportRegion(10, 20, 2, 2),
            ReportReason.Threat,
            "context",
            new ClientContext("web", "1.0"));

    private static TestServices CreateServices(
        AccountPolicyState policy,
        ReportAdmissionOutcome outcome = ReportAdmissionOutcome.Allowed,
        Exception? storeFailure = null)
    {
        var limiter = new RecordingRateLimiter(outcome);
        var store = new RecordingReportStore(storeFailure);
        var provider = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IAccountPolicyService>(new PolicyService(policy))
            .AddSingleton<IReportRateLimiter>(limiter)
            .AddSingleton<IReportEvidenceCollector>(new EvidenceCollector())
            .AddSingleton<IReportStore>(store)
            .BuildServiceProvider();
        return new TestServices(provider, limiter, store);
    }

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

    private sealed record TestServices(
        ServiceProvider Provider,
        RecordingRateLimiter Limiter,
        RecordingReportStore Store);

    private sealed class IdentityAccessor : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(new AccountId("private-firebase-uid"), false, true));
    }

    private sealed class PolicyService(AccountPolicyState policy) : IAccountPolicyService
    {
        public ValueTask<AccountPolicyState> GetAsync(
            AccountId accountId,
            string requiredCommunityStandardsVersion,
            CancellationToken cancellationToken = default) => ValueTask.FromResult(policy);

        public ValueTask AcceptCommunityStandardsAsync(
            AccountId accountId,
            string version,
            CancellationToken cancellationToken = default) => ValueTask.CompletedTask;
    }

    private sealed class RecordingRateLimiter(ReportAdmissionOutcome outcome)
        : IReportRateLimiter
    {
        public int CallCount { get; private set; }

        public int ReleaseCount { get; private set; }

        public ValueTask<ReportAdmissionOutcome> TryAcquireAsync(
            ReportCommand command,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            return ValueTask.FromResult(outcome);
        }

        public ValueTask ReleaseAsync(
            ReportCommand command,
            CancellationToken cancellationToken = default)
        {
            ReleaseCount++;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class EvidenceCollector : IReportEvidenceCollector
    {
        public ValueTask<ReportEvidence> CollectAsync(
            ReportCommand command,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(new ReportEvidence("{}", [1, 2, 3]));
    }

    private sealed class RecordingReportStore(Exception? failure) : IReportStore
    {
        public int SavedCount { get; private set; }

        public ValueTask SaveAsync(
            ReportCommand command,
            ReportEvidence evidence,
            CancellationToken cancellationToken = default)
        {
            if (failure is not null)
            {
                return ValueTask.FromException(failure);
            }

            SavedCount++;
            return ValueTask.CompletedTask;
        }
    }
}
