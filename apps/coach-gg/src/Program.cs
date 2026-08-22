using CoachGG.Hubs;
using CoachGG.Services;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Config from env vars (Railway injects these)
var apiKey = Environment.GetEnvironmentVariable("STARTGG_APIKEY")
    ?? builder.Configuration["StartGG:ApiKey"]
    ?? throw new Exception("STARTGG_APIKEY env var not set");

var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL")
    ?? Environment.GetEnvironmentVariable("REDIS_CONNECTION")
    ?? builder.Configuration["Redis:ConnectionString"]
    ?? "localhost:6379";

// Parse rediss:// or redis:// URL into StackExchange.Redis connection string
static string ParseRedisUrl(string url)
{
    if (!url.StartsWith("redis://") && !url.StartsWith("rediss://")) return url;
    var ssl = url.StartsWith("rediss://");
    var uri = new Uri(url);
    var host = uri.Host;
    var port = uri.Port > 0 ? uri.Port : (ssl ? 6380 : 6379);
    var password = uri.UserInfo.Contains(':') ? Uri.UnescapeDataString(uri.UserInfo.Split(':', 2)[1]) : "";
    return $"{host}:{port},password={password},ssl={ssl},abortConnect=False,connectTimeout=5000,syncTimeout=5000";
}

var redisConn = ParseRedisUrl(redisUrl);

// Redis
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(redisConn));
builder.Services.AddSingleton<RedisService>();

// HTTP client for start.gg
builder.Services.AddHttpClient<StartGGService>(client =>
{
    client.BaseAddress = new Uri("https://api.start.gg/gql/alpha");
    client.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.Timeout = TimeSpan.FromSeconds(30);
});

// App services
builder.Services.AddSingleton<AggregationService>();
builder.Services.AddSingleton<JobManager>();

// SignalR
builder.Services.AddSignalR(opts =>
{
    opts.EnableDetailedErrors = builder.Environment.IsDevelopment();
    opts.MaximumReceiveMessageSize = 1024 * 1024; // 1MB
}).AddJsonProtocol(opts =>
{
    opts.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

// CORS (allow frontend everywhere)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

builder.Services.AddControllers().AddJsonOptions(opts =>
{
    opts.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

var app = builder.Build();

app.UseCors();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(
        Path.Combine(app.Environment.ContentRootPath, "static")),
    RequestPath = "/static"
});
// Also serve index.html from static/ at root
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(
        Path.Combine(app.Environment.ContentRootPath, "static")),
    RequestPath = ""
});
app.UseRouting();

// Health check (used by Railway)
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// SignalR hub
app.MapHub<AnalysisHub>("/analysishub");

// Legacy REST endpoints
app.MapGet("/counterpicker/{slug}", async (string slug, RedisService redis, StartGGService startGG, AggregationService agg) =>
{
    var cached = await redis.GetCachedGamesAsync(slug);
    if (cached.HasValue)
    {
        var (userId, games) = cached.Value;
        return Results.Ok(agg.ComputeAll(userId, games));
    }
    var (newUserId, newGames) = await startGG.GetGamesMetadataAsync(slug);
    if (newUserId == null) return Results.NotFound(new { error = "User not found" });
    await redis.SetCachedGamesAsync(slug, newUserId.Value, newGames);
    return Results.Ok(agg.ComputeAll(newUserId.Value, newGames));
});

// Serve index.html for root and /counterpick/* (frontend routing)
app.MapFallback(async ctx =>
{
    ctx.Response.ContentType = "text/html";
    await ctx.Response.SendFileAsync(Path.Combine(app.Environment.ContentRootPath, "static", "index.html"));
});

app.Run();
