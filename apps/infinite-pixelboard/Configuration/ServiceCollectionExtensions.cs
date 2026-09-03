using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using PixelBoard.Application;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Ledger;
using PixelBoard.Infrastructure.Moderation;
using PixelBoard.Infrastructure.Notifications;
using PixelBoard.Infrastructure.Postgres;
using PixelBoard.Infrastructure.Realtime;
using PixelBoard.Infrastructure.StoreKit;
using PixelBoard.Infrastructure.Stripe;
using StackExchange.Redis;

namespace PixelBoard.Configuration;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddProductOptions(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        var legacyRedisConnection = Environment.GetEnvironmentVariable("redisconnectionstring");
        var configuredRedisConnection = configuration[$"{RedisOptions.SectionName}:ConnectionString"]
            ?? configuration["redisconnectionstring"];
        var redisConnection = NormalizeRedisConnectionString(legacyRedisConnection
            ?? configuredRedisConnection
            ?? (environment.IsDevelopment() ? "localhost:6379" : string.Empty));

        services
            .AddOptions<RedisOptions>()
            .Bind(configuration.GetSection(RedisOptions.SectionName))
            .PostConfigure(options => options.ConnectionString = redisConnection)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services
            .AddOptions<FirebaseOptions>()
            .Bind(configuration.GetSection(FirebaseOptions.SectionName))
            .Validate(
                options => !options.Enabled || !string.IsNullOrWhiteSpace(options.ProjectId),
                "Firebase:ProjectId is required when Firebase is enabled.")
            .ValidateOnStart();

        services
            .AddOptions<PostgresOptions>()
            .Bind(configuration.GetSection(PostgresOptions.SectionName))
            .PostConfigure(options =>
                options.ConnectionString = PostgresConnectionString.Normalize(
                    options.ConnectionString))
            .Validate(
                options => !options.Enabled || !string.IsNullOrWhiteSpace(options.ConnectionString),
                "Postgres:ConnectionString is required when PostgreSQL is enabled.")
            .ValidateOnStart();

        services
            .AddOptions<PlacementOutboxOptions>()
            .Bind(configuration.GetSection(PlacementOutboxOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services
            .AddOptions<StoreKitOptions>()
            .Bind(configuration.GetSection(StoreKitOptions.SectionName))
            .Validate(
                options => !options.Enabled
                    || (!string.IsNullOrWhiteSpace(options.BundleId)
                        && !string.IsNullOrWhiteSpace(options.MonthlyProductId)
                        && !string.IsNullOrWhiteSpace(options.AnnualProductId)
                        && options.TrustedRootCertificates.Length > 0
                        && options.TrustedRootCertificates.All(IsCertificate)
                        && options.AllowedEnvironments.Length > 0),
                "StoreKit bundle, product, environment, and trusted root certificate settings are required when StoreKit is enabled.")
            .ValidateOnStart();

        services
            .AddOptions<StripeOptions>()
            .Bind(configuration.GetSection(StripeOptions.SectionName))
            .Validate(
                options => !options.Enabled
                    || (IsStripeSecret(options.SecretKey)
                        && IsStripeWebhookSecret(options.WebhookSecret)
                        && IsStripePriceId(options.MonthlyPriceId)
                        && IsStripePriceId(options.AnnualPriceId)),
                "Stripe secret, webhook signing secret, and monthly/annual price IDs are required when Stripe is enabled.")
            .ValidateOnStart();

        services
            .AddOptions<AdvertisingOptions>()
            .Bind(configuration.GetSection(AdvertisingOptions.SectionName))
            .Validate(
                options => !options.WebEnabled
                    || (IsAdSensePublisherId(options.AdSensePublisherId)
                        && IsNumericId(options.AdSenseBoardSlotId)),
                "Valid AdSense publisher and manual board slot IDs are required when web advertising is enabled.")
            .Validate(
                options => !options.MobileEnabled
                    || (IsAdMobApplicationId(options.AdMobApplicationId)
                        && IsSafeAdContentRating(options.AdMobMaxContentRating)),
                "A valid AdMob application ID and G, PG, or T content rating are required when mobile advertising is enabled.")
            .Validate(
                options => (!options.WebEnabled && !options.MobileEnabled)
                    || options.ModerationOperationsEnabled,
                "Advertising cannot be enabled until staffed moderation operations are enabled.")
            .ValidateOnStart();
        services.AddSingleton<IAdvertisingPolicy, ConfiguredAdvertisingPolicy>();

        services
            .AddOptions<SecurityOptions>()
            .Bind(configuration.GetSection(SecurityOptions.SectionName))
            .Validate(
                options => !options.AbuseSignalHashingEnabled
                    || options.AbuseSignalHmacKey.Length >= 32,
                "A Security:AbuseSignalHmacKey of at least 32 characters is required when abuse-signal hashing is enabled.")
            .ValidateOnStart();

        services
            .AddOptions<BoardClientOptions>()
            .Bind(configuration.GetSection(BoardClientOptions.SectionName));

        services
            .AddOptions<PlacementRateLimitOptions>()
            .Bind(configuration.GetSection(PlacementRateLimitOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services
            .AddOptions<ApnsOptions>()
            .Bind(configuration.GetSection(ApnsOptions.SectionName))
            .Validate(
                options => !options.Enabled
                    || (IsAppleTeamId(options.TeamId)
                        && IsAppleKeyId(options.KeyId)
                        && IsPemPrivateKey(options.PrivateKey)
                        && IsBundleId(options.BundleId)
                        && options.Environment is "production" or "sandbox"),
                "APNs TeamId, KeyId, private key, bundle ID, and environment are required when APNs is enabled.")
            .ValidateDataAnnotations()
            .ValidateOnStart();

        return services;
    }

    public static IServiceCollection AddBoardStorage(this IServiceCollection services)
    {
        services.AddSingleton<IPlacementValidator, PlacementValidator>();
        services.AddSingleton<IReportValidator, ReportValidator>();
        services.AddStackExchangeRedisCache(_ => { });
        services
            .AddOptions<RedisCacheOptions>()
            .Configure<IOptions<RedisOptions>>((cacheOptions, productOptions) =>
            {
                cacheOptions.Configuration = productOptions.Value.ConnectionString;
                cacheOptions.InstanceName = productOptions.Value.InstanceName;
            });

        services.AddSingleton<IBoardStore, RedisBoardStore>();
        services
            .AddHealthChecks()
            .AddCheck<BoardStorageHealthCheck>("board-storage", tags: ["ready"]);

        return services;
    }

    public static IServiceCollection AddModerationLedger(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>($"{PostgresOptions.SectionName}:Enabled"))
        {
            if (configuration.GetValue<bool>($"{ApnsOptions.SectionName}:Enabled"))
            {
                throw new InvalidOperationException(
                    "PostgreSQL must be enabled when APNs notifications are enabled.");
            }
            return services;
        }

        services.AddSingleton(provider =>
        {
            var redisOptions = provider.GetRequiredService<IOptions<RedisOptions>>().Value;
            return ConnectionMultiplexer.Connect(redisOptions.ConnectionString);
        });
        services.AddSingleton<IConnectionMultiplexer>(
            provider => provider.GetRequiredService<ConnectionMultiplexer>());
        services.AddSingleton(provider =>
        {
            var postgresOptions = provider.GetRequiredService<IOptions<PostgresOptions>>().Value;
            return NpgsqlDataSource.Create(postgresOptions.ConnectionString);
        });
        services.AddSingleton<IAtomicPlacementStore, RedisAtomicPlacementStore>();
        services.AddSingleton<IRealtimeEventPublisher, RedisRealtimeEventPublisher>();
        services.AddSingleton<RealtimeEventDeliveryPolicy>();
        services.AddHostedService<RedisRealtimeEventSubscriber>();
        services.AddSingleton<IPlacementLedger, PostgresPlacementLedger>();
        services.AddSingleton<IReportRateLimiter, RedisReportRateLimiter>();
        services.AddSingleton<IPlacementRateLimiter, RedisPlacementRateLimiter>();
        services.AddSingleton<IReportEvidenceCollector, ReportEvidenceCollector>();
        services.AddSingleton<IReportStore, PostgresReportStore>();
        services.AddSingleton<PostgresModerationService>();
        services.AddSingleton<IModerationService>(
            provider => provider.GetRequiredService<PostgresModerationService>());
        services.AddSingleton<IPlatformSafetyService>(
            provider => provider.GetRequiredService<PostgresModerationService>());
        services.AddSingleton<IBoardVisibilityFilter>(
            provider => provider.GetRequiredService<PostgresModerationService>());
        services.AddSingleton<PostgresAccountStateService>();
        services.AddSingleton<IAccountPolicyService>(
            provider => provider.GetRequiredService<PostgresAccountStateService>());
        services.AddSingleton<IEntitlementService>(
            provider => provider.GetRequiredService<PostgresAccountStateService>());
        services.AddSingleton<IAccountDeletionService, PostgresAccountDeletionService>();
        services.AddSingleton<IAccountOperationGuard, PostgresAccountOperationGuard>();
        services.AddSingleton<PostgresReferralService>();
        services.AddSingleton<IReferralService>(
            provider => provider.GetRequiredService<PostgresReferralService>());
        services.AddSingleton<IPaintBoostService>(
            provider => provider.GetRequiredService<PostgresReferralService>());
        services.AddSingleton<PostgresSpecialCodeService>();
        services.AddSingleton<ISpecialCodeService>(
            provider => provider.GetRequiredService<PostgresSpecialCodeService>());
        services.AddHostedService<PlacementOutboxWorker>();
        services.AddSingleton<INotificationStore, PostgresNotificationStore>();
        services.AddHttpClient<ApnsClient>();
        services.AddHostedService<NotificationOutboxWorker>();
        services
            .AddHealthChecks()
            .AddCheck<PostgresHealthCheck>("postgres-ledger", tags: ["ready"]);

        return services;
    }

    public static IServiceCollection AddStoreKitEntitlements(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>($"{StoreKitOptions.SectionName}:Enabled"))
        {
            return services;
        }

        if (!configuration.GetValue<bool>($"{PostgresOptions.SectionName}:Enabled"))
        {
            throw new InvalidOperationException(
                "PostgreSQL must be enabled when StoreKit is enabled.");
        }

        services.AddSingleton<IStoreKitTransactionVerifier, StoreKitTransactionVerifier>();
        services.AddSingleton<PostgresStoreKitEntitlementStore>();
        services.AddSingleton<IStoreKitEntitlementStore>(
            provider => provider.GetRequiredService<PostgresStoreKitEntitlementStore>());
        return services;
    }

    public static IServiceCollection AddStripeBilling(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>($"{StripeOptions.SectionName}:Enabled"))
        {
            return services;
        }

        if (!configuration.GetValue<bool>($"{PostgresOptions.SectionName}:Enabled"))
        {
            throw new InvalidOperationException(
                "PostgreSQL must be enabled when Stripe is enabled.");
        }

        services.AddSingleton<StripeGateway>();
        services.AddSingleton<IStripeBillingGateway>(
            provider => provider.GetRequiredService<StripeGateway>());
        services.AddSingleton<PostgresStripeBillingStore>();
        services.AddSingleton<IStripeBillingStore>(
            provider => provider.GetRequiredService<PostgresStripeBillingStore>());
        return services;
    }

    private static bool IsCertificate(string encodedCertificate)
    {
        try
        {
            using var certificate = X509CertificateLoader.LoadCertificate(
                Convert.FromBase64String(encodedCertificate));
            return certificate.RawData.Length > 0;
        }
        catch (Exception exception)
            when (exception is FormatException or CryptographicException)
        {
            return false;
        }
    }

    private static bool IsAdSensePublisherId(string value) =>
        value.StartsWith("ca-pub-", StringComparison.Ordinal)
        && IsNumericId(value["ca-pub-".Length..]);

    private static bool IsAdMobApplicationId(string value)
    {
        if (!value.StartsWith("ca-app-pub-", StringComparison.Ordinal))
        {
            return false;
        }

        var parts = value["ca-app-pub-".Length..].Split('~');
        return parts.Length == 2 && parts.All(IsNumericId);
    }

    private static bool IsNumericId(string value) =>
        value.Length >= 6 && value.All(char.IsAsciiDigit);

    private static bool IsStripeSecret(string value) =>
        value.StartsWith("sk_", StringComparison.Ordinal)
        || value.StartsWith("rk_", StringComparison.Ordinal);

    private static bool IsStripeWebhookSecret(string value) =>
        value.StartsWith("whsec_", StringComparison.Ordinal);

    private static bool IsStripePriceId(string value) =>
        value.StartsWith("price_", StringComparison.Ordinal);

    private static bool IsSafeAdContentRating(string value) =>
        value is "G" or "PG" or "T";

    private static bool IsAppleTeamId(string value) =>
        value.Length == 10 && value.All(char.IsLetterOrDigit);

    private static bool IsAppleKeyId(string value) =>
        value.Length == 10 && value.All(char.IsLetterOrDigit);

    private static bool IsPemPrivateKey(string value) =>
        value.Contains("BEGIN PRIVATE KEY", StringComparison.Ordinal);

    private static bool IsBundleId(string value) =>
        value.Length is > 2 and < 256
        && value.Split('.').All(part => part.Length > 0);

    // StackExchange.Redis does not support the redis:// URI scheme; it would treat the
    // whole URI (including "redis://" and the port) as a hostname and fail to connect.
    private static string NormalizeRedisConnectionString(string connectionString)
    {
        var isUriScheme = connectionString is not null
            && (connectionString.StartsWith("redis://", StringComparison.OrdinalIgnoreCase)
                || connectionString.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrWhiteSpace(connectionString) || !isUriScheme)
        {
            return connectionString;
        }

        if (!Uri.TryCreate(connectionString, UriKind.Absolute, out var uri))
        {
            throw new InvalidOperationException(
                $"Redis connection string '{connectionString}' uses the redis:// scheme but could not be parsed.");
        }

        var parts = new List<string> { $"{uri.Host}:{(uri.IsDefaultPort ? 6379 : uri.Port)}" };
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var separator = uri.UserInfo.IndexOf(':');
            var username = separator < 0 ? uri.UserInfo : uri.UserInfo[..separator];
            var password = separator < 0 ? null : uri.UserInfo[(separator + 1)..];
            if (username is not ("default" or "")) parts.Add($"user={username}");
            if (!string.IsNullOrEmpty(password)) parts.Add($"password={password}");
        }

        // Render Key Value external endpoints use TLS on 6380; internal endpoints are plaintext.
        if (uri.Port == 6380 || uri.Scheme == "rediss") parts.Add("ssl=true");

        var path = uri.AbsolutePath.Trim('/');
        if (!string.IsNullOrEmpty(path)) parts.Add($"defaultDatabase={path}");

        return string.Join(',', parts);
    }
}
