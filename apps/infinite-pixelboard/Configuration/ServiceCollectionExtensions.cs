using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Options;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Ledger;
using PixelBoard.Infrastructure.Postgres;
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
                        && !string.IsNullOrWhiteSpace(options.AnnualProductId)),
                "StoreKit bundle and product identifiers are required when StoreKit is enabled.")
            .ValidateOnStart();

        services
            .AddOptions<AdvertisingOptions>()
            .Bind(configuration.GetSection(AdvertisingOptions.SectionName))
            .Validate(
                options => !options.WebEnabled
                    || !string.IsNullOrWhiteSpace(options.AdSensePublisherId),
                "An AdSense publisher ID is required when web advertising is enabled.")
            .Validate(
                options => !options.MobileEnabled
                    || !string.IsNullOrWhiteSpace(options.AdMobApplicationId),
                "An AdMob application ID is required when mobile advertising is enabled.")
            .ValidateOnStart();

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
}
