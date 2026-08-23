using System.Text.Json;
using System.Text.Json.Serialization;

namespace PixelBoard.Contracts.V1;

public interface IStableIdentifier<TSelf>
    where TSelf : struct, IStableIdentifier<TSelf>
{
    Guid Value { get; }

    static abstract TSelf From(Guid value);
}

[JsonConverter(typeof(StableIdentifierJsonConverter<PlacementId>))]
public readonly record struct PlacementId(Guid Value) : IStableIdentifier<PlacementId>
{
    public static PlacementId New() => new(Guid.NewGuid());

    public static PlacementId From(Guid value) => new(value);
}

[JsonConverter(typeof(StableIdentifierJsonConverter<ReportId>))]
public readonly record struct ReportId(Guid Value) : IStableIdentifier<ReportId>
{
    public static ReportId New() => new(Guid.NewGuid());

    public static ReportId From(Guid value) => new(value);
}

[JsonConverter(typeof(StableIdentifierJsonConverter<ModerationActionId>))]
public readonly record struct ModerationActionId(Guid Value) : IStableIdentifier<ModerationActionId>
{
    public static ModerationActionId New() => new(Guid.NewGuid());

    public static ModerationActionId From(Guid value) => new(value);
}

[JsonConverter(typeof(StableIdentifierJsonConverter<BanId>))]
public readonly record struct BanId(Guid Value) : IStableIdentifier<BanId>
{
    public static BanId New() => new(Guid.NewGuid());

    public static BanId From(Guid value) => new(value);
}

[JsonConverter(typeof(StableIdentifierJsonConverter<AppAccountToken>))]
public readonly record struct AppAccountToken(Guid Value) : IStableIdentifier<AppAccountToken>
{
    public static AppAccountToken New() => new(Guid.NewGuid());

    public static AppAccountToken From(Guid value) => new(value);
}

public sealed class StableIdentifierJsonConverter<TIdentifier> : JsonConverter<TIdentifier>
    where TIdentifier : struct, IStableIdentifier<TIdentifier>
{
    public override TIdentifier Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        var rawValue = reader.GetString();
        if (!Guid.TryParseExact(rawValue, "N", out var value))
        {
            throw new JsonException($"Invalid {typeof(TIdentifier).Name}.");
        }

        return TIdentifier.From(value);
    }

    public override void Write(
        Utf8JsonWriter writer,
        TIdentifier value,
        JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.Value.ToString("N"));
    }
}
