namespace CoachGG.Models;

public enum JobStatus { Pending, Running, Complete, Error }

public class JobState
{
    public JobStatus Status { get; set; }
    public int CurrentPage { get; set; }
    public int TotalPages { get; set; }
    public PlayerStats? PartialStats { get; set; }
    public PlayerStats? FinalStats { get; set; }
    public string? Error { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    // Bump this whenever PlayerStats schema changes to bust stale cached job states
    public string? StatsVersion { get; set; }
}
