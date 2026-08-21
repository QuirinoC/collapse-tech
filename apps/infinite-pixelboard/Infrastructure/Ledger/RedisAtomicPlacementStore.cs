using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PixelBoard.Configuration;
using PixelBoard.Domain;
using StackExchange.Redis;

namespace PixelBoard.Infrastructure.Ledger;

public sealed class RedisAtomicPlacementStore(
    IConnectionMultiplexer redis,
    IOptions<RedisOptions> options) : IAtomicPlacementStore
{
    public const string OutboxKey = "PlacementOutbox";
    public const string CurrentOwnersKey = "CurrentPixelOwners";
    public const string IdempotencyKeyPrefix = "PlacementIdempotency";
    public const string CooldownKeyPrefix = "PlacementCooldown";
    private const long IdempotencyRetentionMilliseconds = 86_400_000;

    private static readonly string DefaultTile = BoardTileSerializer.Serialize(
        BoardTileSerializer.CreateDefault());

    private const string PlacePixelScript =
        """
        local duplicate_json = redis.call('GET', KEYS[4])
        if duplicate_json then
            local duplicate = cjson.decode(duplicate_json)
            if duplicate['fingerprint'] ~= ARGV[9] then
                return {'', '', '', '', '0', '0', '0', '1', '', '', '', ''}
            end
            local duplicate_cooldown_ttl = redis.call('PTTL', KEYS[5])
            if duplicate_cooldown_ttl < 0 then
                duplicate_cooldown_ttl = 0
            end
            return {
                duplicate['streamEntryId'],
                duplicate['priorPlacementId'] or '',
                duplicate['priorColor'],
                duplicate['placementId'],
                '1',
                '1',
                tostring(duplicate_cooldown_ttl),
                '0',
                tostring(duplicate['row']),
                tostring(duplicate['column']),
                duplicate['color'],
                duplicate['placedAt']
            }
        end

        local cooldown_ttl = redis.call('PTTL', KEYS[5])
        if cooldown_ttl > 0 then
           return {'', '', '', '', '0', '0', tostring(cooldown_ttl), '0', '', '', '', ''}
        end

        local tile_type = redis.call('TYPE', KEYS[1])['ok']
        local tile_json
        if tile_type == 'hash' then
            tile_json = redis.call('HGET', KEYS[1], 'data')
        elseif tile_type == 'string' then
            tile_json = redis.call('GET', KEYS[1])
        end
        if not tile_json then
            tile_json = ARGV[3]
        end

        local tile = cjson.decode(tile_json)
        local row = tonumber(ARGV[1])
        local column = tonumber(ARGV[2])
        local prior_color = tile[row][column]
        tile[row][column] = ARGV[4]

        local prior_placement_id = redis.call('HGET', KEYS[3], ARGV[5])
        local event = cjson.decode(ARGV[6])
        event['priorColor'] = prior_color
        if prior_placement_id then
            event['priorPlacementId'] = prior_placement_id
        else
            event['priorPlacementId'] = cjson.null
        end

        if tile_type == 'string' then
            redis.call('DEL', KEYS[1])
        end
        redis.call(
            'HSET',
            KEYS[1],
            'data',
            cjson.encode(tile),
            'absexp',
            '-1',
            'sldexp',
            '-1')
        redis.call('HSET', KEYS[3], ARGV[5], ARGV[7])
        local stream_id = redis.call(
            'XADD',
            KEYS[2],
            '*',
            'payload',
            cjson.encode(event))

        local idempotency_result = {
            streamEntryId = stream_id,
            placementId = ARGV[7],
            priorPlacementId = prior_placement_id or '',
            priorColor = prior_color,
            fingerprint = ARGV[9],
            row = event['row'],
            column = event['column'],
            color = event['color'],
            placedAt = event['placedAt']
        }
        redis.call(
            'SET',
            KEYS[4],
            cjson.encode(idempotency_result),
            'PX',
            ARGV[10])
        redis.call('SET', KEYS[5], '1', 'PX', ARGV[8])

        return {
            stream_id,
            prior_placement_id or '',
            prior_color,
            ARGV[7],
            '0',
            '1',
            ARGV[8],
            '0',
            tostring(event['row']),
            tostring(event['column']),
            event['color'],
            event['placedAt']
        }
        """;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly RedisOptions _options = options.Value;

    public async ValueTask<AtomicPlacementResult> PlaceAsync(
        PlacementLedgerEvent placement,
        TimeSpan cooldown,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var cooldownMilliseconds = checked((long)cooldown.TotalMilliseconds);
        if (cooldownMilliseconds < 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(cooldown),
                "Placement cooldown must be at least one millisecond.");
        }

        var location = BoardGeometry.Locate(
            new BoardPosition(placement.Row, placement.Column));
        var database = redis.GetDatabase();
        var ownerField = $"{placement.Row}:{placement.Column}";
        var accountHash = Hash(placement.FirebaseUid);
        var idempotencyHash = Hash(
            $"{placement.FirebaseUid}\0{placement.IdempotencyKey}");
        var requestFingerprint = Hash(
            $"{placement.Row}\0{placement.Column}\0{placement.Color}\0" +
            $"{placement.ClientPlatform}\0{placement.ClientVersion}");
        var eventJson = JsonSerializer.Serialize(placement, JsonOptions);

        var result = (RedisResult[]?)await database.ScriptEvaluateAsync(
            PlacePixelScript,
            [
                GetPhysicalKey(BoardGeometry.GetTilePartitionKey(location.Tile)),
                GetPhysicalKey(OutboxKey),
                GetPhysicalKey(CurrentOwnersKey),
                GetPhysicalKey($"{IdempotencyKeyPrefix}:{idempotencyHash}"),
                GetPhysicalKey($"{CooldownKeyPrefix}:{accountHash}")
            ],
            [
                location.Offset.Row + 1,
                location.Offset.Column + 1,
                DefaultTile,
                placement.Color,
                ownerField,
                eventJson,
                placement.PlacementId.Value.ToString("N"),
                cooldownMilliseconds,
                requestFingerprint,
                IdempotencyRetentionMilliseconds
            ]) ?? throw new RedisException("Atomic placement returned no result.");

        var isAccepted = result[5].ToString() == "1";
        var isIdempotencyConflict = result[7].ToString() == "1";
        var remainingMilliseconds = long.Parse(
            result[6].ToString(),
            CultureInfo.InvariantCulture);
        if (!isAccepted)
        {
            return new AtomicPlacementResult(
               false,
               string.Empty,
               null,
               false,
               isIdempotencyConflict,
               null,
               null,
               null,
               TimeSpan.FromMilliseconds(remainingMilliseconds));
        }

        var streamEntryId = result[0].ToString();
        var priorPlacementValue = result[1].ToString();
        Contracts.V1.PlacementId? priorPlacementId =
            Guid.TryParseExact(priorPlacementValue, "N", out var parsed)
            ? Contracts.V1.PlacementId.From(parsed)
            : null;
        var acceptedPlacementId = Contracts.V1.PlacementId.From(
            Guid.ParseExact(result[3].ToString(), "N"));
        var pixel = new Contracts.V1.PixelState(
            int.Parse(result[8].ToString(), CultureInfo.InvariantCulture),
            int.Parse(result[9].ToString(), CultureInfo.InvariantCulture),
            result[10].ToString(),
            DateTimeOffset.Parse(
                result[11].ToString(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind));

        return new AtomicPlacementResult(
            true,
            streamEntryId,
            acceptedPlacementId,
            result[4].ToString() == "1",
            false,
            priorPlacementId,
            result[2].ToString(),
            pixel,
            TimeSpan.FromMilliseconds(remainingMilliseconds));
    }

    private RedisKey GetPhysicalKey(string key)
    {
        return $"{_options.InstanceName}{key}";
    }

    private static string Hash(string value)
    {
        return Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    }
}
