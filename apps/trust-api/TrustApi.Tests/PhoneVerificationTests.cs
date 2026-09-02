using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using TrustApi.Application;
using TrustApi.Configuration;
using TrustApi.Domain;
using TrustApi.Infrastructure;
using TrustApi.Infrastructure.Phone;

namespace TrustApi.Tests;

public sealed class PhoneVerificationTests
{
    [Fact]
    public void PlaceholderNameIsNotOnboardingComplete()
    {
        var account = new Account(Guid.NewGuid(), "apple", "sub", "You", false, null, DateTimeOffset.UtcNow);
        Assert.False(account.HasChosenDisplayName);
        Assert.False(account.HasVerifiedPhone);
        Assert.False(account.HasHandle);
        Assert.False(account.OnboardingComplete);
    }

    [Fact]
    public void ChosenNameAndVerifiedPhoneWithoutHandleIsNotOnboardingComplete()
    {
        var account = new Account(
            Guid.NewGuid(),
            "apple",
            "sub",
            "Sam",
            false,
            null,
            DateTimeOffset.UtcNow,
            "+15555550100",
            DateTimeOffset.UtcNow);
        Assert.True(account.HasChosenDisplayName);
        Assert.True(account.HasVerifiedPhone);
        Assert.False(account.OnboardingComplete);
    }

    [Fact]
    public void HandleCompletesOnboarding()
    {
        var account = new Account(
            Guid.NewGuid(),
            "apple",
            "sub",
            "You",
            false,
            null,
            DateTimeOffset.UtcNow,
            Handle: "jordan");
        Assert.True(account.HasHandle);
        Assert.True(account.OnboardingComplete);
        Assert.Equal("@jordan", account.PublicName);
    }

    [Fact]
    public void PhoneE164NormalizesUsNumbers()
    {
        Assert.True(PhoneE164.TryNormalize("4155550100", out var local));
        Assert.Equal("+14155550100", local);
        Assert.True(PhoneE164.TryNormalize("+44 7700 900123", out var intl));
        Assert.Equal("+447700900123", intl);
        Assert.False(PhoneE164.TryNormalize("123", out _));
    }

    [Fact]
    public async Task DevelopmentBypassReturnsCodeAndDoesNotLogIt()
    {
        var store = new MemoryTrustStore();
        var engine = new TrustEngine(store, TimeProvider.System);
        var account = await engine.SignInAsync("development", "otp-dev", "Sam", CancellationToken.None);
        var logger = new ListLogger();
        var phones = NewPhones(store, new UnconfiguredSms(), logger, Environments.Development);

        var sent = await phones.SendAsync(account.Id, "+15555550123", CancellationToken.None);
        Assert.False(string.IsNullOrWhiteSpace(sent.DevelopmentCode));
        Assert.Equal(6, sent.DevelopmentCode!.Length);
        Assert.All(logger.Messages, message => Assert.DoesNotContain(sent.DevelopmentCode, message));

        await phones.VerifyAsync(account.Id, "5555550123", sent.DevelopmentCode, CancellationToken.None);
        var updated = await store.FindAccountAsync(account.Id, CancellationToken.None);
        Assert.True(updated!.HasVerifiedPhone);
        Assert.False(updated.OnboardingComplete);
        Assert.Equal("+15555550123", updated.PhoneE164);
    }

    [Fact]
    public async Task ConfiguredSmsDoesNotReturnDevelopmentCode()
    {
        var store = new MemoryTrustStore();
        var engine = new TrustEngine(store, TimeProvider.System);
        var account = await engine.SignInAsync("development", "otp-sms", "Sam", CancellationToken.None);
        var sms = new RecordingSms();
        var phones = NewPhones(store, sms, NullLogger<PhoneVerificationService>.Instance, Environments.Development);

        var sent = await phones.SendAsync(account.Id, "+15555550124", CancellationToken.None);
        Assert.Null(sent.DevelopmentCode);
        Assert.Equal("+15555550124", sms.LastTo);
        Assert.False(string.IsNullOrWhiteSpace(sms.LastCode));

        await phones.VerifyAsync(account.Id, "+15555550124", sms.LastCode!, CancellationToken.None);
        Assert.True((await store.FindAccountAsync(account.Id, CancellationToken.None))!.HasVerifiedPhone);
    }

    [Fact]
    public async Task ProductionWithoutTwilioDoesNotBypass()
    {
        var store = new MemoryTrustStore();
        var engine = new TrustEngine(store, TimeProvider.System);
        var account = await engine.SignInAsync("development", "otp-prod", "Sam", CancellationToken.None);
        var phones = NewPhones(store, new UnconfiguredSms(), NullLogger<PhoneVerificationService>.Instance, Environments.Production);

        var exception = await Assert.ThrowsAsync<TrustException>(() =>
            phones.SendAsync(account.Id, "+15555550125", CancellationToken.None));
        Assert.Equal("otp_not_configured", exception.Code);
    }

    [Fact]
    public async Task WrongCodeIsRejectedWithoutCompleting()
    {
        var store = new MemoryTrustStore();
        var engine = new TrustEngine(store, TimeProvider.System);
        var account = await engine.SignInAsync("development", "otp-wrong", "Sam", CancellationToken.None);
        var phones = NewPhones(store, new UnconfiguredSms(), NullLogger<PhoneVerificationService>.Instance, Environments.Development);
        var sent = await phones.SendAsync(account.Id, "+15555550126", CancellationToken.None);

        var exception = await Assert.ThrowsAsync<TrustException>(() =>
            phones.VerifyAsync(account.Id, "+15555550126", "000000", CancellationToken.None));
        Assert.Equal("otp_invalid", exception.Code);
        Assert.NotEqual("000000", sent.DevelopmentCode);
        Assert.False((await store.FindAccountAsync(account.Id, CancellationToken.None))!.HasVerifiedPhone);
    }

    [Fact]
    public async Task PhoneCannotBeVerifiedOntoTwoAccounts()
    {
        var store = new MemoryTrustStore();
        var engine = new TrustEngine(store, TimeProvider.System);
        var first = await engine.SignInAsync("development", "otp-a", "Sam", CancellationToken.None);
        var second = await engine.SignInAsync("development", "otp-b", "Jordan", CancellationToken.None);
        var phones = NewPhones(store, new UnconfiguredSms(), NullLogger<PhoneVerificationService>.Instance, Environments.Development);
        var sent = await phones.SendAsync(first.Id, "+15555550127", CancellationToken.None);
        await phones.VerifyAsync(first.Id, "+15555550127", sent.DevelopmentCode!, CancellationToken.None);

        var exception = await Assert.ThrowsAsync<TrustException>(() =>
            phones.SendAsync(second.Id, "+15555550127", CancellationToken.None));
        Assert.Equal("phone_in_use", exception.Code);
    }

    private static PhoneVerificationService NewPhones(
        ITrustStore store,
        ISmsOtpSender sms,
        ILogger<PhoneVerificationService> logger,
        string environment)
    {
        return new PhoneVerificationService(
            store,
            sms,
            new AuthOptions { SigningKey = "development-signing-key-32bytes-min!!" },
            TimeProvider.System,
            new TestHostEnvironment { EnvironmentName = environment },
            logger);
    }

    private sealed class UnconfiguredSms : ISmsOtpSender
    {
        public bool IsConfigured => false;

        public Task SendAsync(string e164, string code, CancellationToken cancellationToken) =>
            Task.CompletedTask;
    }

    private sealed class RecordingSms : ISmsOtpSender
    {
        public bool IsConfigured => true;
        public string? LastTo { get; private set; }
        public string? LastCode { get; private set; }

        public Task SendAsync(string e164, string code, CancellationToken cancellationToken)
        {
            LastTo = e164;
            LastCode = code;
            return Task.CompletedTask;
        }
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "TrustApi.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class ListLogger : ILogger<PhoneVerificationService>
    {
        public List<string> Messages { get; } = [];

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            Messages.Add(formatter(state, exception));
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();
            public void Dispose()
            {
            }
        }
    }
}

public sealed class PhoneVerificationApiTests : IClassFixture<TrustApiFactory>
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _client;

    public PhoneVerificationApiTests(TrustApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task HttpSendAndVerifyDoesNotCompleteOnboarding()
    {
        var deviceId = Guid.NewGuid().ToString("N");
        var session = await _client.PostAsJsonAsync(
            "/api/v1/session/development",
            new { displayName = "Sam", provider = "development", deviceId });
        session.EnsureSuccessStatusCode();
        var payload = await session.Content.ReadFromJsonAsync<SessionOnboardingWire>(Json);
        Assert.False(payload!.You.OnboardingComplete);
        Assert.False(payload.You.PhoneVerified);

        var phone = UniquePhone();
        using var send = new HttpRequestMessage(HttpMethod.Post, "/api/v1/me/phone/send");
        send.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", payload.Token);
        send.Content = JsonContent.Create(new { phone });
        var sendResponse = await _client.SendAsync(send);
        sendResponse.EnsureSuccessStatusCode();
        var otp = await sendResponse.Content.ReadFromJsonAsync<SendWire>(Json);
        Assert.False(string.IsNullOrWhiteSpace(otp!.DevelopmentCode));

        using var verify = new HttpRequestMessage(HttpMethod.Post, "/api/v1/me/phone/verify");
        verify.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", payload.Token);
        verify.Content = JsonContent.Create(new { phone, code = otp.DevelopmentCode });
        var verifyResponse = await _client.SendAsync(verify);
        verifyResponse.EnsureSuccessStatusCode();

        using var circleRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/circle");
        circleRequest.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", payload.Token);
        var circleResponse = await _client.SendAsync(circleRequest);
        circleResponse.EnsureSuccessStatusCode();
        var circle = await circleResponse.Content.ReadFromJsonAsync<CircleOnboardingWire>(Json);
        Assert.False(circle!.You.OnboardingComplete);
        Assert.True(circle.You.PhoneVerified);
    }

    private static string UniquePhone() =>
        $"+1555555{RandomNumberGenerator.GetInt32(1000, 10000)}";

    private sealed record SessionOnboardingWire(string Token, OnboardingPersonWire You);
    private sealed record OnboardingPersonWire(Guid Id, string DisplayName, bool HasCircle, bool OnboardingComplete, bool PhoneVerified);
    private sealed record SendWire(string? DevelopmentCode);
    private sealed record CircleOnboardingWire(OnboardingPersonWire You);
}
