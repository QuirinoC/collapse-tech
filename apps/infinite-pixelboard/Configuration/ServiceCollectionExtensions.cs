using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using PixelBoard.Application;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Ledger;
using PixelBoard.Infrastructure.Moderation;
using PixelBoard.Infrastructure.Postgres;
using PixelBoard.Infrastructure.StoreKit;
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
        var redisConnection = legacyRedisConnection
            ?? configuredRedisConnection
            ?? (environment.IsDevelopment() ? "localhost:6379" : string.Empty);

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
        services.AddSingleton<IPlacementLedger, PostgresPlacementLedger>();
        services.AddSingleton<IReportRateLimiter, RedisReportRateLimiter>();
        services.AddSingleton<IReportEvidenceCollector, ReportEvidenceCollector>();
        services.AddSingleton<IReportStore, PostgresReportStore>();
        services.AddSingleton<PostgresAccountStateService>();
        services.AddSingleton<IAccountPolicyService>(
            provider => provider.GetRequiredService<PostgresAccountStateService>());
        services.AddSingleton<IEntitlementService>(
            provider => provider.GetRequiredService<PostgresAccountStateService>());
        services.AddHostedService<PlacementOutboxWorker>();
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

    private static bool IsSafeAdContentRating(string value) =>
        value is "G" or "PG" or "T";
}
