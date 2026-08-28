using System.Collections.Concurrent;
using CoachGG.Models;
using Microsoft.AspNetCore.SignalR;
using CoachGG.Hubs;

namespace CoachGG.Services;

public class JobManager
{
    private static readonly TimeSpan JobLeaseDuration = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan JobLeaseRecoveryCheckInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan JobLeaseHeartbeatInterval = TimeSpan.FromMinutes(1);
    private readonly ConcurrentDictionary<string, byte> _running = new();
    private readonly ConcurrentDictionary<string, byte> _leaseRecoveryScheduled = new();
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

    public void ScheduleLeaseRecovery(string slug)
    {
        if (!_leaseRecoveryScheduled.TryAdd(slug, 0))
            return;

        _ = Task.Run(() => RecoverExpiredLeaseAsync(slug, _applicationLifetime.ApplicationStopping));
    }

    private async Task RunJobAsync(string slug, CancellationToken stoppingToken)
    {
        using var jobCancellation = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var jobToken = jobCancellation.Token;
        var heartbeat = MaintainLeaseAsync(slug, jobCancellation);

        try
        {
            jobToken.ThrowIfCancellationRequested();
            await EnsureLeaseOwnershipAsync(slug);
            await SetJobStateIfLeaseOwnerAsync(slug, new JobState { Status = JobStatus.Running });

            var (userId, games) = await _startGG.GetGamesMetadataAsync(
                slug,
                async (page, total, gamesSoFar, uid) =>
                {
                    await EnsureLeaseOwnershipAsync(slug);
                    var partial = _aggregations.ComputeAll(uid, gamesSoFar);
                    jobToken.ThrowIfCancellationRequested();
                    await EnsureLeaseOwnershipAsync(slug);
                    var state = new JobState
                    {
                        Status = JobStatus.Running,
                        CurrentPage = page,
                        TotalPages = total,
                        PartialStats = partial
                    };
                    await SetJobStateIfLeaseOwnerAsync(slug, state);
                    await _hub.Clients.Group(slug).SendAsync("Progress", new
                    {
                        slug,
                        currentPage = page,
                        totalPages = total,
                        partialStats = partial
                    }, jobToken);
                },
                jobToken);

            await EnsureLeaseOwnershipAsync(slug);
            jobToken.ThrowIfCancellationRequested();
            if (userId == null)
                throw new Exception($"User '{slug}' not found on start.gg");

            await _redis.SetCachedGamesAsync(slug, userId.Value, games);
            var finalStats = _aggregations.ComputeAll(userId.Value, games);
            jobToken.ThrowIfCancellationRequested();
            await EnsureLeaseOwnershipAsync(slug);
            await SetJobStateIfLeaseOwnerAsync(slug, new JobState
            {
                Status = JobStatus.Complete,
                FinalStats = finalStats,
                StatsVersion = Constants.StatsVersion
            }, TimeSpan.FromHours(24));

            await _hub.Clients.Group(slug).SendAsync("JobComplete", new { slug, stats = finalStats }, jobToken);
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
        catch (OperationCanceledException) when (jobToken.IsCancellationRequested)
        {
            _logger.LogWarning("Job lease renewal failed for {Slug}; stopping this worker", slug);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job failed for {Slug}", slug);
            await ReportFailureIfLeaseOwnerAsync(slug, ex);
        }
        finally
        {
            jobCancellation.Cancel();
            await heartbeat;
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

    private async Task SetJobStateIfLeaseOwnerAsync(string slug, JobState state, TimeSpan? ttl = null)
    {
        if (!await _redis.TrySetJobStateIfLeaseOwnerAsync(slug, _ownerId, state, ttl))
            throw new JobLeaseLostException();
    }

    private async Task ReportFailureIfLeaseOwnerAsync(string slug, Exception error)
    {
        try
        {
            var stored = await _redis.TrySetJobStateIfLeaseOwnerAsync(slug, _ownerId, new JobState
            {
                Status = JobStatus.Error,
                Error = error.Message
            }, TimeSpan.FromMinutes(5));
            if (stored)
                await _hub.Clients.Group(slug).SendAsync("JobError", new { slug, error = error.Message });
            else
                _logger.LogWarning("Not reporting a job failure for {Slug} because the lease is no longer owned", slug);
        }
        catch (Exception reportException)
        {
            _logger.LogError(reportException, "Failed to report job failure for {Slug}", slug);
        }
    }

    private async Task RecoverExpiredLeaseAsync(string slug, CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var state = await _redis.GetJobStateAsync(slug);
                if (state is { Status: not JobStatus.Running })
                    return;

                if (await StartJobAsync(slug))
                    return;

                await Task.Delay(JobLeaseRecoveryCheckInterval, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Lease recovery cancelled during application shutdown for {Slug}", slug);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lease recovery failed for {Slug}", slug);
            await _hub.Clients.Group(slug).SendAsync("JobError", new
            {
                slug,
                error = "Analysis recovery failed. Please try again shortly."
            });
        }
        finally
        {
            _leaseRecoveryScheduled.TryRemove(slug, out _);
        }
    }

    private async Task MaintainLeaseAsync(string slug, CancellationTokenSource jobCancellation)
    {
        try
        {
            using var timer = new PeriodicTimer(JobLeaseHeartbeatInterval);
            while (!jobCancellation.IsCancellationRequested)
            {
                if (!await _redis.RenewJobLeaseAsync(slug, _ownerId, JobLeaseDuration))
                {
                    _logger.LogWarning("Job lease expired for {Slug}; stopping this worker", slug);
                    jobCancellation.Cancel();
                    return;
                }

                if (!await timer.WaitForNextTickAsync(jobCancellation.Token))
                    return;
            }
        }
        catch (OperationCanceledException) when (jobCancellation.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to renew job lease for {Slug}; stopping this worker", slug);
            jobCancellation.Cancel();
        }
    }

    private sealed class JobLeaseLostException : Exception;
}
