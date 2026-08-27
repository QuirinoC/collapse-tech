using CoachGG.Models;
using CoachGG.Services;
using Xunit;

namespace CoachGG.Tests;

/// <summary>
/// Regression tests for aggregation robustness: start.gg payloads with missing/null
/// User, Slug, entrants, selections or games must be skipped gracefully — never crash
/// the analysis job mid-stream.
/// </summary>
public class AggregationServiceTests
{
    private readonly AggregationService _agg = new();

    private static RawGame Game(
        long? winnerId,
        int? charA = 1313, int? charB = 1302,
        string? slugA = "user/aaaa", string? slugB = "user/bbbb",
        long? userAId = 1, long? userBId = 2,
        bool includeParticipantsB = true,
        bool includeSecondParticipantA = false)
    {
        var selA = new GameSelection
        {
            SelectionValue = charA,
            Entrant = new GameEntrant
            {
                Id = 100,
                Participants = userAId == null ? null :
                    includeSecondParticipantA
                        ? [new GameParticipant { User = new GameUser { Id = userAId, Slug = slugA } }, new GameParticipant { User = new GameUser { Id = 3, Slug = "user/cccc" } }]
                        : [new GameParticipant { User = new GameUser { Id = userAId, Slug = slugA } }]
            }
        };
        var selB = new GameSelection
        {
            SelectionValue = charB,
            Entrant = new GameEntrant
            {
                Id = 200,
                // opponent with NO linked start.gg user at all (null participants list)
                Participants = !includeParticipantsB ? null : [new GameParticipant { User = new GameUser { Id = userBId, Slug = slugB } }]
            }
        };
        return new RawGame
        {
            WinnerId = winnerId,
            Stage = new GameStage { Id = 32, Name = "Battlefield" },
            Selections = [selA, selB]
        };
    }

    [Fact]
    public void FlattenGames_MissingOpponentUser_IsSkippedNotCrash()
    {
        var games = new List<RawGame> { Game(winnerId: 100, includeParticipantsB: false) };
        var flat = _agg.FlattenGames(games);
        Assert.Empty(flat);
    }

    [Fact]
    public void FlattenGames_NullSlug_FallsBackToEmptyString()
    {
        var flat = _agg.FlattenGames([Game(winnerId: 200, slugA: null)]);
        var game = Assert.Single(flat);
        Assert.Equal("", game.SlugA);
    }

    [Fact]
    public void FlattenGames_SlugWithoutUserPrefix_ParsesTail()
    {
        var flat = _agg.FlattenGames([Game(winnerId: 200, slugA: "bc954a2e")]);
        var game = Assert.Single(flat);
        Assert.Equal("", game.SlugA.Split('/').ElementAtOrDefault(1) ?? "");
    }

    [Fact]
    public void FlattenGames_WinnerIdMatchesNoEntrant_IsSkipped()
    {
        var flat = _agg.FlattenGames([Game(winnerId: 999)]);
        Assert.Empty(flat);
    }

    [Fact]
    public void FlattenGames_WrongSelectionCount_IsSkipped()
    {
        var g = Game(winnerId: 100);
        g.Selections = [g.Selections![0]];
        Assert.Empty(_agg.FlattenGames([g]));
    }

    [Fact]
    public void FlattenGames_NullSelectionsAndGames_AreHandled()
    {
        Assert.Empty(_agg.FlattenGames([new RawGame { WinnerId = 1, Selections = null }]));
        Assert.Empty(_agg.ComputeAll(1, [new RawGame { WinnerId = 1, Selections = null }]).WinrateByStage);
    }

    [Fact]
    public void ComputeAll_EmptySetList_ReturnsEmptyStats()
    {
        // A player whose sets page has zero entries must complete with empty stats, not hang/fail
        var stats = _agg.ComputeAll(42, []);
        Assert.Empty(stats.WinrateByStage);
        Assert.Empty(stats.WinrateByCharacter);
        Assert.Equal(42, stats.UserId);
    }

    [Fact]
    public void ComputeAll_HappyPath_CountsWins()
    {
        var stats = _agg.ComputeAll(2, [Game(winnerId: 200), Game(winnerId: 100)]);
        var stage = Assert.Single(stats.WinrateByStage);
        Assert.Equal(50, stage.Value.WinRate);
        // userId 2 is the B entrant → their character is CharacterB (Mario)
        var mario = Assert.Single(stats.WinrateByCharacter);
        Assert.Equal("Mario", mario.Key);
        Assert.Equal(1, mario.Value.WinCount);
    }

    [Fact]
    public void SkipCharacters_AreNulledOut()
    {
        var flat = _agg.FlattenGames([Game(winnerId: 200, charB: 1746)]); // Random Character
        var game = Assert.Single(flat);
        Assert.Null(game.CharacterB);
    }

    [Fact]
    public void FlattenGames_TeamEntrants_AreSkippedInsteadOfMisattributed()
    {
        var flat = _agg.FlattenGames([Game(winnerId: 100, includeSecondParticipantA: true)]);
        Assert.Empty(flat);
    }

    [Fact]
    public void ComputeAll_UserMissingFromGame_DoesNotCreditOpponentB()
    {
        var stats = _agg.ComputeAll(999, [Game(winnerId: 100)]);
        Assert.Empty(stats.WinrateByStage);
        Assert.Empty(stats.WinrateByCharacter);
    }
}
