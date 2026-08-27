using CoachGG.Models;

namespace CoachGG.Services;

public class AggregationService
{
    public List<FlatGame> FlattenGames(List<RawGame> games)
    {
        var result = new List<FlatGame>();

        foreach (var game in games)
        {
            var selections = game.Selections ?? new List<GameSelection>();
            if (selections.Count != 2) continue;

            var selA = selections[0];
            var selB = selections[1];
            var entrantA = selA.Entrant;
            var entrantB = selB.Entrant;

            // A team entrant has multiple users but only one selection, so assigning that
            // selection to its first participant would produce incorrect individual stats.
            if (entrantA?.Participants?.Count != 1 || entrantB?.Participants?.Count != 1) continue;

            var participantA = entrantA.Participants[0];
            var participantB = entrantB.Participants[0];

            var opponentA = participantA?.User?.Id;
            var opponentB = participantB?.User?.Id;

            if (opponentA == null || opponentB == null) continue;

            long winnerId;
            if (game.WinnerId == entrantA.Id)
                winnerId = opponentA.Value;
            else if (game.WinnerId == entrantB.Id)
                winnerId = opponentB.Value;
            else
                continue;

            var slugA = (participantA?.User?.Slug ?? "/").Split('/').ElementAtOrDefault(1) ?? "";
            var slugB = (participantB?.User?.Slug ?? "/").Split('/').ElementAtOrDefault(1) ?? "";
            var winnerSlug = game.WinnerId == entrantA?.Id ? slugA : slugB;

            var charIdA = selA.SelectionValue;
            var charIdB = selB.SelectionValue;

            // Null out characters that are placeholder/random so all aggregations skip them
            if (charIdA.HasValue && Constants.UltimateCharacters.TryGetValue(charIdA.Value, out var nameA) && Constants.SkipCharacters.Contains(nameA))
                charIdA = null;
            if (charIdB.HasValue && Constants.UltimateCharacters.TryGetValue(charIdB.Value, out var nameB) && Constants.SkipCharacters.Contains(nameB))
                charIdB = null;

            result.Add(new FlatGame
            {
                WinnerId = winnerId,
                WinnerSlug = winnerSlug,
                OpponentA = opponentA.Value,
                OpponentB = opponentB.Value,
                CharacterA = charIdA,
                CharacterB = charIdB,
                SlugA = slugA,
                SlugB = slugB,
                StageId = game.Stage?.Id,
                StageName = game.Stage?.Name
            });
        }

        return result;
    }

    public Dictionary<string, StatEntry> WinrateByStage(long userId, List<FlatGame> games)
    {
        var res = new Dictionary<string, StatEntry>();

        foreach (var game in games)
        {
            if (!IsPlayerInGame(userId, game)) continue;
            if (game.StageName == null) continue;
            if (!res.TryGetValue(game.StageName, out var entry))
            {
                entry = new StatEntry();
                res[game.StageName] = entry;
            }
            entry.Total++;
            if (userId == game.WinnerId) entry.WinCount++;
        }

        foreach (var kv in res)
            kv.Value.WinRate = kv.Value.Total > 0 ? Math.Round(100.0 * kv.Value.WinCount / kv.Value.Total, 2) : 0;

        return res;
    }

    public Dictionary<string, StatEntry> WinrateByCharacter(long userId, List<FlatGame> games)
    {
        var res = new Dictionary<string, StatEntry>();

        foreach (var game in games)
        {
            if (!TryGetPlayerCharacter(userId, game, out var charId)) continue;
            if (charId == null || !Constants.UltimateCharacters.TryGetValue(charId.Value, out var charName)) continue;

            if (!res.TryGetValue(charName, out var entry))
            {
                entry = new StatEntry();
                res[charName] = entry;
            }
            entry.Total++;
            if (userId == game.WinnerId) entry.WinCount++;
        }

        foreach (var kv in res)
            kv.Value.WinRate = kv.Value.Total > 0 ? Math.Round(100.0 * kv.Value.WinCount / kv.Value.Total, 2) : 0;

        return res;
    }

    public Dictionary<string, Dictionary<string, StatEntry>> WinrateStageByCharacter(long userId, List<FlatGame> games)
    {
        var res = new Dictionary<string, Dictionary<string, StatEntry>>();

        foreach (var game in games)
        {
            if (!TryGetPlayerCharacter(userId, game, out var charId)) continue;
            if (charId == null || !Constants.UltimateCharacters.TryGetValue(charId.Value, out var charName)) continue;
            if (game.StageName == null) continue;

            if (!res.ContainsKey(charName)) res[charName] = new Dictionary<string, StatEntry>();
            if (!res[charName].TryGetValue(game.StageName, out var entry))
            {
                entry = new StatEntry();
                res[charName][game.StageName] = entry;
            }

            entry.Total++;
            if (userId == game.WinnerId) entry.WinCount++;
        }

        foreach (var charKv in res)
            foreach (var stageKv in charKv.Value)
                stageKv.Value.WinRate = stageKv.Value.Total > 0
                    ? Math.Round(100.0 * stageKv.Value.WinCount / stageKv.Value.Total, 2) : 0;

        return res;
    }

    public Dictionary<string, StatEntry> WinrateByOpponentCharacter(long userId, List<FlatGame> games)
    {
        var res = new Dictionary<string, StatEntry>();

        foreach (var game in games)
        {
            if (!TryGetPlayerCharacter(userId, game, out _, out var oppCharId)) continue;
            if (oppCharId == null || !Constants.UltimateCharacters.TryGetValue(oppCharId.Value, out var charName)) continue;

            if (!res.TryGetValue(charName, out var entry))
            {
                entry = new StatEntry();
                res[charName] = entry;
            }
            entry.Total++;
            if (userId == game.WinnerId) entry.WinCount++;
        }

        foreach (var kv in res)
            kv.Value.WinRate = kv.Value.Total > 0 ? Math.Round(100.0 * kv.Value.WinCount / kv.Value.Total, 2) : 0;

        return res;
    }

    /// <summary>
    /// For each character I play, breakdown by opponent's character: myChar → oppChar → stats.
    /// Use this to counterpick: "When I play Ness, I beat Mario 70% but lose to Kazuya 30%."
    /// </summary>
    public Dictionary<string, Dictionary<string, StatEntry>> WinrateOppCharByMyChar(long userId, List<FlatGame> games)
    {
        var res = new Dictionary<string, Dictionary<string, StatEntry>>();

        foreach (var game in games)
        {
            if (!TryGetPlayerCharacter(userId, game, out var myCharId, out var oppCharId)) continue;

            if (myCharId == null || !Constants.UltimateCharacters.TryGetValue(myCharId.Value, out var myChar)) continue;
            if (oppCharId == null || !Constants.UltimateCharacters.TryGetValue(oppCharId.Value, out var oppChar)) continue;

            // myChar is the outer key
            if (!res.ContainsKey(myChar)) res[myChar] = new Dictionary<string, StatEntry>();
            if (!res[myChar].TryGetValue(oppChar, out var entry))
            {
                entry = new StatEntry();
                res[myChar][oppChar] = entry;
            }

            entry.Total++;
            if (userId == game.WinnerId) entry.WinCount++;
        }

        foreach (var myKv in res)
            foreach (var oppKv in myKv.Value)
                oppKv.Value.WinRate = oppKv.Value.Total > 0
                    ? Math.Round(100.0 * oppKv.Value.WinCount / oppKv.Value.Total, 2) : 0;

        return res;
    }

    private static bool IsPlayerInGame(long userId, FlatGame game)
        => userId == game.OpponentA || userId == game.OpponentB;

    private static bool TryGetPlayerCharacter(long userId, FlatGame game, out int? characterId)
        => TryGetPlayerCharacter(userId, game, out characterId, out _);

    private static bool TryGetPlayerCharacter(long userId, FlatGame game, out int? characterId, out int? opponentCharacterId)
    {
        if (userId == game.OpponentA)
        {
            characterId = game.CharacterA;
            opponentCharacterId = game.CharacterB;
            return true;
        }

        if (userId == game.OpponentB)
        {
            characterId = game.CharacterB;
            opponentCharacterId = game.CharacterA;
            return true;
        }

        characterId = null;
        opponentCharacterId = null;
        return false;
    }

    public PlayerStats ComputeAll(long userId, List<RawGame> games)
    {
        var flat = FlattenGames(games);
        return new PlayerStats
        {
            UserId = userId,
            WinrateByStage = WinrateByStage(userId, flat),
            WinrateByCharacter = WinrateByCharacter(userId, flat),
            WinrateStageByCharacter = WinrateStageByCharacter(userId, flat),
            WinrateByOpponentCharacter = WinrateByOpponentCharacter(userId, flat),
            WinrateMyCharByOpponentChar = WinrateOppCharByMyChar(userId, flat)
        };
    }
}
