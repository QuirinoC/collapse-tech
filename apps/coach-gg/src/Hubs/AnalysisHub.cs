using Microsoft.AspNetCore.SignalR;
using CoachGG.Services;
using CoachGG.Models;

namespace CoachGG.Hubs;

public class AnalysisHub : Hub
{
    private readonly JobManager _jobManager;
    private readonly RedisService _redis;
    private readonly AggregationService _aggregations;
    private readonly ILogger<AnalysisHub> _logger;

    public AnalysisHub(JobManager jobManager, RedisService redis, AggregationService aggregations, ILogger<AnalysisHub> logger)
    {
        _jobManager = jobManager;
        _redis = redis;
        _aggregations = aggregations;
        _logger = logger;
    }

    public async Task Subscribe(string slug)
    {
        slug = slug.Trim();
        if (string.IsNullOrEmpty(slug))
        {
            await Clients.Caller.SendAsync("JobError", new { slug, error = "Invalid slug" });
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, slug);
        _logger.LogInformation("Client {ConnectionId} subscribed to {Slug}", Context.ConnectionId, slug);

        // 1. Check if job is already complete in Redis
        var jobState = await _redis.GetJobStateAsync(slug);
        if (jobState != null)
        {
            if (jobState.Status == JobStatus.Complete && jobState.FinalStats != null
                && jobState.StatsVersion == Constants.StatsVersion)
            {
                await Clients.Caller.SendAsync("JobComplete", new { slug, stats = jobState.FinalStats });
                return;
            }
            if (jobState.Status == JobStatus.Running)
            {
                // Already in progress — send current snapshot, worker continues
                await Clients.Caller.SendAsync("Progress", new
                {
                    slug,
                    currentPage = jobState.CurrentPage,
                    totalPages = jobState.TotalPages,
                    partialStats = jobState.PartialStats
                });

                if (_jobManager.IsRunning(slug))
                    return;

                // Stale "Running" row: the worker died (deploy/restart) and will never finish.
                // Clear it so the fresh job below can start instead of leaving clients on an
                // eternal progress bar.
                _logger.LogWarning("Discarding stale Running job state for {Slug} — no worker alive", slug);
                await _redis.DeleteJobStateAsync(slug);
            }
            else
            {
                // Stale version, error, or unexpected state — clear and recompute
                await _redis.DeleteJobStateAsync(slug);
            }
        }

        // 2. Check if game data is already cached (fast path)
        var cached = await _redis.GetCachedGamesAsync(slug);
        if (cached.HasValue)
        {
            var (userId, games) = cached.Value;
            var stats = _aggregations.ComputeAll(userId, games);
            await _redis.SetJobStateAsync(slug, new JobState { Status = JobStatus.Complete, FinalStats = stats, StatsVersion = Constants.StatsVersion }, TimeSpan.FromHours(24));
            await Clients.Caller.SendAsync("JobComplete", new { slug, stats });
            return;
        }

        // 3. Start new job
        await Clients.Caller.SendAsync("JobQueued", new { slug, message = "Fetching player data from start.gg..." });
        var started = await _jobManager.StartJobAsync(slug);
        if (!started)
        {
            // Job was already starting (race), send waiting status
            await Clients.Caller.SendAsync("Progress", new { slug, currentPage = 0, totalPages = 0, partialStats = (object?)null });
        }
    }
}
