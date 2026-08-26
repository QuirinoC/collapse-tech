using CoachGG.Models;
using Microsoft.AspNetCore.SignalR;
using CoachGG.Hubs;

namespace CoachGG.Services;

public class JobManager
{
    private readonly SemaphoreSlim _mutex = new(1, 1);
    private readonly HashSet<string> _running = new();
    private readonly IHubContext<AnalysisHub> _hub;
    private readonly StartGGService _startGG;
    private readonly AggregationService _aggregations;
    private readonly RedisService _redis;
    private readonly ILogger<JobManager> _logger;

    public JobManager(
        IHubContext<AnalysisHub> hub,
        StartGGService startGG,
        AggregationService aggregations,
        RedisService redis,
        ILogger<JobManager> logger)
    {
        _hub = hub;
        _startGG = startGG;
        _aggregations = aggregations;
        _redis = redis;
        _logger = logger;
    }

    public async Task<bool> StartJobAsync(string slug)
    {
        await _mutex.WaitAsync();
        try
        {
            if (_running.Contains(slug)) return false;
            _running.Add(slug);
        }
        finally { _mutex.Release(); }

        _ = Task.Run(() => RunJobAsync(slug));
        return true;
    }

    /// <summary>Whether a worker for this slug exists in THIS process. Redis job_state can say
    /// "Running" after a deploy/restart killed the worker — callers must double-check this.</summary>
    public bool IsRunning(string slug)
    {
        lock (_running) { return _running.Contains(slug); }
    }

    private async Task RunJobAsync(string slug)
    {
        try
        {
            await _redis.SetJobStateAsync(slug, new JobState { Status = JobStatus.Running });

            var (userId, games) = await _startGG.GetGamesMetadataAsync(slug, async (page, total, gamesSoFar, uid) =>
            {
                var partial = _aggregations.ComputeAll(uid, gamesSoFar);
                var state = new JobState
                {
                    Status = JobStatus.Running,
                    CurrentPage = page,
                    TotalPages = total,
                    PartialStats = partial
                };
                await _redis.SetJobStateAsync(slug, state);
                await _hub.Clients.Group(slug).SendAsync("Progress", new
                {
                    slug,
                    currentPage = page,
                    totalPages = total,
                    partialStats = partial
                });
            });

            if (userId == null)
                throw new Exception($"User '{slug}' not found on start.gg");

            await _redis.SetCachedGamesAsync(slug, userId.Value, games);

            var finalStats = _aggregations.ComputeAll(userId.Value, games);
            await _redis.SetJobStateAsync(slug, new JobState
            {
                Status = JobStatus.Complete,
                FinalStats = finalStats,
                StatsVersion = Constants.StatsVersion
            }, TimeSpan.FromHours(24));

            await _hub.Clients.Group(slug).SendAsync("JobComplete", new { slug, stats = finalStats });
            _logger.LogInformation("Job complete for {Slug}", slug);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job failed for {Slug}", slug);
            await _redis.SetJobStateAsync(slug, new JobState
            {
                Status = JobStatus.Error,
                Error = ex.Message
            }, TimeSpan.FromMinutes(5));
            await _hub.Clients.Group(slug).SendAsync("JobError", new { slug, error = ex.Message });
        }
        finally
        {
            lock (_running) { _running.Remove(slug); }
        }
    }
}
