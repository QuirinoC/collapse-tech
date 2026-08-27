using CoachGG.Hubs;
using CoachGG.Services;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Config from env vars (Railway injects these)
// Fail fast on a MISSING *or BLANK* key: an empty string used to slip past the null check and
// boot "healthy" while every start.gg call failed with HTTP 400 Invalid authentication token.
var apiKey = Environment.GetEnvironmentVariable("STARTGG_APIKEY")
    ?? builder.Configuration["StartGG:ApiKey"];
if (string.IsNullOrWhiteSpace(apiKey))
    throw new Exception("STARTGG_APIKEY env var not set or blank — get a key at https://start.gg/admin/profile (Developer Settings)");

var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL")
    ?? Environment.GetEnvironmentVariable("REDIS_CONNECTION")
    ?? builder.Configuration["Redis:ConnectionString"]
    ?? "localhost:6379";

var redisOptions = RedisConnectionOptions.Parse(redisUrl);

// Redis
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(redisOptions));
builder.Services.AddSingleton<RedisService>();

// HTTP client for start.gg
builder.Services.AddHttpClient<StartGGService>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["StartGG:Host"] ?? Constants.StartGGHost);
    client.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.Timeout = TimeSpan.FromSeconds(30);
});

// App services
builder.Services.AddSingleton<AggregationService>();
builder.Services.AddSingleton<JobManager>();

// Search service (separate HttpClient instance)
builder.Services.AddHttpClient<SearchService>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["StartGG:Host"] ?? Constants.StartGGHost);
    client.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.Timeout = TimeSpan.FromSeconds(10);
});

// SignalR
builder.Services.AddSignalR(opts =>
{
    opts.EnableDetailedErrors = builder.Environment.IsDevelopment();
    opts.MaximumReceiveMessageSize = 1024 * 1024; // 1MB
}).AddJsonProtocol(opts =>
{
    opts.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
}).AddStackExchangeRedis(options =>
{
    options.Configuration = redisOptions;
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
app.Use(async (context, next) =>
{
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://ssb.wiki.gallery data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()";
    context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000";
    await next();
});
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

// Player search endpoint — used by autocomplete
app.MapGet("/search", async (string q, SearchService search, HttpContext ctx) =>
{
    if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
        return Results.Ok(new List<object>());

    try
    {
        var results = await search.SearchAsync(q, ctx.RequestAborted);
        return Results.Ok(results);
    }
    catch (StartGgUnavailableException ex)
    {
        // Upstream outage/auth failure must not masquerade as "no players found" (200 [])
        return ex.IsRateLimit
            ? Results.Json(new { error = "start.gg rate limit exceeded — try again shortly" }, statusCode: 503)
            : Results.Json(new { error = ex.Message }, statusCode: 502);
    }
});

// SignalR hub
app.MapHub<AnalysisHub>("/analysishub");

// Legacy REST endpoints
app.MapGet("/counterpicker/{slug}", async (string slug, RedisService redis, StartGGService startGG, AggregationService agg, HttpContext ctx) =>
{
    if (!PlayerSlug.TryNormalize(slug, out var normalizedSlug))
        return Results.BadRequest(new { error = "Invalid slug" });

    var cached = await redis.GetCachedGamesAsync(normalizedSlug);
    if (cached.HasValue)
    {
        var (userId, games) = cached.Value;
        return Results.Ok(agg.ComputeAll(userId, games));
    }
    var (newUserId, newGames) = await startGG.GetGamesMetadataAsync(normalizedSlug, ct: ctx.RequestAborted);
    if (newUserId == null) return Results.NotFound(new { error = "User not found" });
    await redis.SetCachedGamesAsync(normalizedSlug, newUserId.Value, newGames);
    return Results.Ok(agg.ComputeAll(newUserId.Value, newGames));
});

// Serve index.html for root and /counterpick/* (frontend routing)
app.MapFallback(async ctx =>
{
    ctx.Response.ContentType = "text/html";
    await ctx.Response.SendFileAsync(Path.Combine(app.Environment.ContentRootPath, "static", "index.html"));
});

app.Run();
