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

    public async Task Subscribe(string? slug)
    {
        if (!PlayerSlug.TryNormalize(slug, out var normalizedSlug))
        {
            await Clients.Caller.SendAsync("JobError", new { slug, error = "Invalid slug" });
            return;
        }

        slug = normalizedSlug;
        await Groups.AddToGroupAsync(Context.ConnectionId, slug);
        _logger.LogInformation("Client {ConnectionId} subscribed to {Slug}", Context.ConnectionId, slug);

        try
        {
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
                    // Send the shared snapshot. Only an expired lease may be taken over.
                    await Clients.Caller.SendAsync("Progress", new
                    {
                        slug,
                        currentPage = jobState.CurrentPage,
                        totalPages = jobState.TotalPages,
                        partialStats = jobState.PartialStats
                    });

                    if (_jobManager.IsRunning(slug))
                        return;

                    if (!await _jobManager.StartJobAsync(slug))
                        _jobManager.ScheduleLeaseRecovery(slug);
                    return;
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

            // 3. Start new job. A false result means another replica owns its Redis lease.
            await Clients.Caller.SendAsync("JobQueued", new { slug, message = "Fetching player data from start.gg..." });
            if (!await _jobManager.StartJobAsync(slug))
            {
                await Clients.Caller.SendAsync("Progress", new { slug, currentPage = 0, totalPages = 0, partialStats = (object?)null });
                _jobManager.ScheduleLeaseRecovery(slug);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Analysis subscription failed for {Slug}", slug);
            await Clients.Caller.SendAsync("JobError", new
            {
                slug,
                error = "Analysis is temporarily unavailable. Please try again shortly."
            });
        }
    }
}
