namespace CoachGG.Models;

public class GameSelection
{
    public GameEntrant? Entrant { get; set; }
    public int? SelectionValue { get; set; }
}

public class GameEntrant
{
    public long? Id { get; set; }
    public List<GameParticipant>? Participants { get; set; }
}

public class GameParticipant
{
    public GameUser? User { get; set; }
}

public class GameUser
{
    public long? Id { get; set; }
    public string? Slug { get; set; }
}

public class GameStage
{
    public long? Id { get; set; }
    public string? Name { get; set; }
}

public class RawGame
{
    public long? WinnerId { get; set; }
    public List<GameSelection>? Selections { get; set; }
    public GameStage? Stage { get; set; }
}

public class FlatGame
{
    public long WinnerId { get; set; }
    public string WinnerSlug { get; set; } = "";
    public long OpponentA { get; set; }
    public long OpponentB { get; set; }
    public int? CharacterA { get; set; }
    public int? CharacterB { get; set; }
    public string SlugA { get; set; } = "";
    public string SlugB { get; set; } = "";
    public long? StageId { get; set; }
    public string? StageName { get; set; }
}
