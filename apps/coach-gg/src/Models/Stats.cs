namespace CoachGG.Models;

public class StatEntry
{
    public int Total { get; set; }
    public int WinCount { get; set; }
    public double WinRate { get; set; }
}

public class PlayerStats
{
    public long UserId { get; set; }
    public Dictionary<string, StatEntry> WinrateByStage { get; set; } = new();
    public Dictionary<string, StatEntry> WinrateByCharacter { get; set; } = new();
    public Dictionary<string, Dictionary<string, StatEntry>> WinrateStageByCharacter { get; set; } = new();
    public Dictionary<string, StatEntry> WinrateByOpponentCharacter { get; set; } = new();
    public Dictionary<string, Dictionary<string, StatEntry>> WinrateMyCharByOpponentChar { get; set; } = new();
}
