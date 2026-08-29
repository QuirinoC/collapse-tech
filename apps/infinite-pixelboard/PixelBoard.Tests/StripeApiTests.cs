using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Stripe;

namespace PixelBoard.Tests;

public sealed class StripeApiTests
{
    [Fact]
    public async Task ConfigReportsDisabledWithoutSecrets()
    {
        using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IOptions<StripeOptions>>(Options.Create(new StripeOptions()))
            .BuildServiceProvider();

        var result = StripeApi.GetConfig(services.GetRequiredService<IOptions<StripeOptions>>());
        var response = await ExecuteAsync<StripeConfigResponse>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.False(response.Body.Enabled);
    }

    [Fact]
    public async Task CheckoutRedirectsSignedInUsersToStripe()
    {
        var gateway = new RecordingGateway();
        var store = new RecordingStore { CustomerId = "cus_123" };
        await using var services = CreateServices(gateway, store);
        var http = CreateHttpRequest();

        var result = await StripeApi.CreateCheckoutSessionAsync(
            new CreateStripeCheckoutSessionRequest("month"),
            http,
            new IdentityAccessor(),
            Options.Create(EnabledOptions()),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<StripeRedirectResponse>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal("https://checkout.stripe.test/session", response.Body.Url);
        Assert.Equal("price_month", gateway.LastPriceId);
        Assert.Equal("https://pixelboard.test/?billing=success", gateway.LastSuccessUrl);
        Assert.Equal("cus_123", gateway.LastCustomerId);
        Assert.Null(gateway.CreatedCustomerId);
    }

    [Fact]
    public async Task CheckoutCreatesACustomerWhenMissing()
    {
        var gateway = new RecordingGateway();
        var store = new RecordingStore();
        await using var services = CreateServices(gateway, store);

        var result = await StripeApi.CreateCheckoutSessionAsync(
            new CreateStripeCheckoutSessionRequest("year"),
            CreateHttpRequest(),
            new IdentityAccessor(),
            Options.Create(EnabledOptions()),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<StripeRedirectResponse>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal("cus_new", gateway.CreatedCustomerId);
        Assert.Equal("cus_new", store.SavedCustomerId);
        Assert.Equal("price_year", gateway.LastPriceId);
    }

    [Fact]
    public async Task CheckoutRejectsUnknownIntervals()
    {
        await using var services = CreateServices(new RecordingGateway(), new RecordingStore());

        var result = await StripeApi.CreateCheckoutSessionAsync(
            new CreateStripeCheckoutSessionRequest("week"),
            CreateHttpRequest(),
            new IdentityAccessor(),
            Options.Create(EnabledOptions()),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal(ApiErrorCodes.InvalidStripeInterval, response.Body.Code);
    }

    [Fact]
    public async Task PortalRequiresAStripeCustomer()
    {
        await using var services = CreateServices(new RecordingGateway(), new RecordingStore());

        var result = await StripeApi.CreatePortalSessionAsync(
            CreateHttpRequest(),
            new IdentityAccessor(),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal(ApiErrorCodes.StripeCustomerMissing, response.Body.Code);
    }

    [Fact]
    public async Task WebhookAppliesMappedSubscriptions()
    {
        var gateway = new RecordingGateway
        {
            Parsed = new StripeWebhookParseResult(
                true,
                "customer.subscription.updated",
                new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero),
                "account",
                "cus_123",
                "sub_123",
                null),
            Subscription = new StripeSubscriptionSnapshot(
                "sub_123",
                "cus_123",
                "active",
                "price_month",
                new DateTimeOffset(2026, 9, 28, 12, 0, 0, TimeSpan.Zero),
                "account")
        };
        var store = new RecordingStore();
        await using var services = CreateServices(gateway, store);
        var request = CreateWebhookRequest("payload", "sig");

        var result = await StripeApi.ProcessWebhookAsync(
            request,
            services,
            services.GetRequiredService<ILoggerFactory>(),
            CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, await ExecuteStatusAsync(result, services));
        Assert.NotNull(store.Applied);
        Assert.Equal("sub_123", store.Applied.SubscriptionId);
        Assert.Equal("active", store.Applied.Status);
        Assert.Equal("payload", gateway.LastPayload);
        Assert.Equal("sig", gateway.LastSignature);
    }

    [Fact]
    public async Task InvalidWebhookSignaturesAreRejected()
    {
        var gateway = new RecordingGateway
        {
            Parsed = StripeWebhookParseResult.Invalid("bad signature")
        };
        var store = new RecordingStore();
        await using var services = CreateServices(gateway, store);

        var result = await StripeApi.ProcessWebhookAsync(
            CreateWebhookRequest("payload", "sig"),
            services,
            services.GetRequiredService<ILoggerFactory>(),
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status400BadRequest, response.StatusCode);
        Assert.Equal(ApiErrorCodes.InvalidStripeWebhook, response.Body.Code);
        Assert.Null(store.Applied);
    }

    private static StripeOptions EnabledOptions() => new()
    {
        Enabled = true,
        MonthlyPriceId = "price_month",
        AnnualPriceId = "price_year"
    };

    private static ServiceProvider CreateServices(
        IStripeBillingGateway gateway,
        IStripeBillingStore store) =>
        new ServiceCollection()
            .AddLogging()
            .AddSingleton(gateway)
            .AddSingleton(store)
            .BuildServiceProvider();

    private static HttpRequest CreateHttpRequest()
    {
        var context = new DefaultHttpContext();
        context.Request.Scheme = "https";
        context.Request.Host = new HostString("pixelboard.test");
        return context.Request;
    }

    private static HttpRequest CreateWebhookRequest(string payload, string signature)
    {
        var context = new DefaultHttpContext();
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(payload));
        context.Request.Headers["Stripe-Signature"] = signature;
        return context.Request;
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
        var body = await System.Text.Json.JsonSerializer.DeserializeAsync<T>(
            context.Response.Body,
            new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        return (context.Response.StatusCode, Assert.IsType<T>(body));
    }

    private static async Task<int> ExecuteStatusAsync(IResult result, IServiceProvider services)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = services,
            Response = { Body = new MemoryStream() }
        };
        await result.ExecuteAsync(context);
        return context.Response.StatusCode;
    }

    private sealed class IdentityAccessor : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(new AccountId("account"), false, true));
    }

    private sealed class RecordingGateway : IStripeBillingGateway
    {
        public string? LastPriceId { get; private set; }
        public string? LastSuccessUrl { get; private set; }
        public string? LastCustomerId { get; private set; }
        public string? CreatedCustomerId { get; private set; }
        public string? LastPayload { get; private set; }
        public string? LastSignature { get; private set; }
        public StripeWebhookParseResult Parsed { get; init; } =
            StripeWebhookParseResult.Invalid("unconfigured");
        public StripeSubscriptionSnapshot? Subscription { get; init; }

        public StripeWebhookParseResult ParseWebhook(string payload, string signature)
        {
            LastPayload = payload;
            LastSignature = signature;
            return Parsed;
        }

        public Task<string> CreateCustomerAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default)
        {
            CreatedCustomerId = "cus_new";
            return Task.FromResult(CreatedCustomerId);
        }

        public Task<string> CreateCheckoutSessionAsync(
            StripeCheckoutSessionRequest request,
            CancellationToken cancellationToken = default)
        {
            LastCustomerId = request.CustomerId;
            LastPriceId = request.PriceId;
            LastSuccessUrl = request.SuccessUrl;
            return Task.FromResult("https://checkout.stripe.test/session");
        }

        public Task<string> CreatePortalSessionAsync(
            string customerId,
            string returnUrl,
            CancellationToken cancellationToken = default) =>
            Task.FromResult("https://billing.stripe.test/session");

        public Task<StripeSubscriptionSnapshot?> GetSubscriptionAsync(
            string subscriptionId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Subscription);
    }

    private sealed class RecordingStore : IStripeBillingStore
    {
        public string? CustomerId { get; set; }
        public string? SavedCustomerId { get; private set; }
        public StripeSubscriptionUpdate? Applied { get; private set; }

        public ValueTask<string?> GetCustomerIdAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(CustomerId);

        public ValueTask<bool> HasCustomerAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(CustomerId is not null);

        public ValueTask<string?> FindFirebaseUidByCustomerAsync(
            string stripeCustomerId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<string?>(null);

        public ValueTask<string?> SaveCustomerAsync(
            AccountId accountId,
            string stripeCustomerId,
            CancellationToken cancellationToken = default)
        {
            SavedCustomerId = stripeCustomerId;
            CustomerId = stripeCustomerId;
            return ValueTask.FromResult<string?>(stripeCustomerId);
        }

        public ValueTask<bool> ApplyAsync(
            StripeSubscriptionUpdate update,
            CancellationToken cancellationToken = default)
        {
            Applied = update;
            return ValueTask.FromResult(true);
        }
    }
}
