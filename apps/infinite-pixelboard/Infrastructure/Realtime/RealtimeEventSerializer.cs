using System.Text.Json;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Infrastructure.Realtime;

public static class RealtimeEventSerializer
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    public static string Serialize(RealtimeEventEnvelope envelope) =>
        JsonSerializer.Serialize(envelope, JsonOptions);

    public static RealtimeEventEnvelope? Deserialize(string json) =>
        JsonSerializer.Deserialize<RealtimeEventEnvelope>(json, JsonOptions);
}
