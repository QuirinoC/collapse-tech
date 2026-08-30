using System.ComponentModel.DataAnnotations;

namespace PixelBoard.Configuration;

public sealed class RedisOptions
{
    public const string SectionName = "Redis";

    [Required]
    public string ConnectionString { get; set; } = string.Empty;

    [Required]
    public string InstanceName { get; set; } = "PixelBoard_";
}

public sealed class FirebaseOptions
{
    public const string SectionName = "Firebase";

    public bool Enabled { get; set; }

    public string ProjectId { get; set; } = string.Empty;
}

public sealed class PostgresOptions
{
    public const string SectionName = "Postgres";

    public bool Enabled { get; set; }

    public string ConnectionString { get; set; } = string.Empty;
}

public sealed class PlacementOutboxOptions
{
    public const string SectionName = "PlacementOutbox";

    [Range(1, 1_000)]
    public int BatchSize { get; set; } = 100;

    [Range(1_000, 3_600_000)]
    public int ClaimIdleMilliseconds { get; set; } = 30_000;

    [Range(100, 60_000)]
    public int EmptyPollMilliseconds { get; set; } = 1_000;
}

public sealed class StripeOptions
{
    public const string SectionName = "Stripe";

    public bool Enabled { get; set; }

    public string SecretKey { get; set; } = string.Empty;

    public string WebhookSecret { get; set; } = string.Empty;

    public string MonthlyPriceId { get; set; } = string.Empty;

    public string AnnualPriceId { get; set; } = string.Empty;

    [Range(0, 365)]
    public int TrialPeriodDays { get; set; } = 7;
}

public sealed class StoreKitOptions
{
    public const string SectionName = "StoreKit";

    public bool Enabled { get; set; }

    public string BundleId { get; set; } = string.Empty;

    public string MonthlyProductId { get; set; } = string.Empty;

    public string AnnualProductId { get; set; } = string.Empty;

    public string[] TrustedRootCertificates { get; set; } = [];

    public string[] AllowedEnvironments { get; set; } = ["Production"];
}

public sealed class AdvertisingOptions
{
    public const string SectionName = "Advertising";

    public bool WebEnabled { get; set; }

    public bool MobileEnabled { get; set; }

    public bool ModerationOperationsEnabled { get; set; }

    public string AdSensePublisherId { get; set; } = string.Empty;

    public string AdSenseBoardSlotId { get; set; } = string.Empty;

    public string AdMobApplicationId { get; set; } = string.Empty;

    public string AdMobMaxContentRating { get; set; } = "T";
}

public sealed class SecurityOptions
{
    public const string SectionName = "Security";

    public bool AbuseSignalHashingEnabled { get; set; }

    public string AbuseSignalHmacKey { get; set; } = string.Empty;
}

public sealed class BoardClientOptions
{
    public const string SectionName = "Board";

    public string? StatusMessage { get; set; }

    public string? MinimumIosVersion { get; set; }
}

public sealed class PlacementRateLimitOptions
{
    public const string SectionName = "PlacementRateLimit";

    [Range(60, 1_000_000)]
    public int MaxPlacementsPerIpPerMinute { get; set; } = 12_000;

    [Range(10, 100_000)]
    public int MaxAccountsPerIpPerMinute { get; set; } = 2_000;
}
