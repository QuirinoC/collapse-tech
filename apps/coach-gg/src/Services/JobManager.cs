using System.Collections.Concurrent;
using CoachGG.Models;
using Microsoft.AspNetCore.SignalR;
using CoachGG.Hubs;

namespace CoachGG.Services;

public class JobManager
{
    private static readonly TimeSpan JobLeaseDuration = TimeSpan.FromMinutes(3);
    private readonly ConcurrentDictionary<string, byte> _running = new();
    private readonly string _ownerId = Guid.NewGuid().ToString("N");
    private readonly IHubContext<AnalysisHub> _hub;
    private readonly StartGGService _startGG;
    private readonly AggregationService _aggregations;
    private readonly RedisService _redis;
    private readonly ILogger<JobManager> _logger;
    private readonly IHostApplicationLifetime _applicationLifetime;

    public JobManager(
        IHubContext<AnalysisHub> hub,
        StartGGService startGG,
        AggregationService aggregations,
        RedisService redis,
        ILogger<JobManager> logger,
        IHostApplicationLifetime applicationLifetime)
    {
        _hub = hub;
        _startGG = startGG;
        _aggregations = aggregations;
        _redis = redis;
        _logger = logger;
        _applicationLifetime = applicationLifetime;
    }

    public async Task<bool> StartJobAsync(string slug)
    {
        if (!_running.TryAdd(slug, 0))
            return false;

        try
        {
            if (!await _redis.TryAcquireJobLeaseAsync(slug, _ownerId, JobLeaseDuration))
            {
                _running.TryRemove(slug, out _);
                return false;
            }

            _ = Task.Run(() => RunJobAsync(slug, _applicationLifetime.ApplicationStopping));
            return true;
        }
        catch
        {
            _running.TryRemove(slug, out _);
            throw;
        }
    }

    /// <summary>Whether a worker for this slug exists in THIS process. Redis job_state can say
    /// "Running" after a deploy/restart killed the worker — callers must double-check this.</summary>
    public bool IsRunning(string slug) => _running.ContainsKey(slug);

    private async Task RunJobAsync(string slug, CancellationToken stoppingToken)
    {
        try
        {
            stoppingToken.ThrowIfCancellationRequested();
            await _redis.SetJobStateAsync(slug, new JobState { Status = JobStatus.Running });

            var (userId, games) = await _startGG.GetGamesMetadataAsync(
                slug,
                async (page, total, gamesSoFar, uid) =>
                {
                    await EnsureLeaseOwnershipAsync(slug);
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
                    }, stoppingToken);
                },
                stoppingToken);

            await EnsureLeaseOwnershipAsync(slug);
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

            await _hub.Clients.Group(slug).SendAsync("JobComplete", new { slug, stats = finalStats }, stoppingToken);
            _logger.LogInformation("Job complete for {Slug}", slug);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Job cancelled during application shutdown for {Slug}", slug);
        }
        catch (JobLeaseLostException)
        {
            _logger.LogWarning("Job lease was lost for {Slug}; another replica may resume the analysis", slug);
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
            try
            {
                await _redis.ReleaseJobLeaseAsync(slug, _ownerId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to release job lease for {Slug}", slug);
            }
            _running.TryRemove(slug, out _);
        }
    }

    private async Task EnsureLeaseOwnershipAsync(string slug)
    {
        if (!await _redis.RenewJobLeaseAsync(slug, _ownerId, JobLeaseDuration))
            throw new JobLeaseLostException();
    }

    private sealed class JobLeaseLostException : Exception;
}
