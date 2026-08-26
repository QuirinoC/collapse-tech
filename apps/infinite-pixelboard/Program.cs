using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;
using PixelBoard.Api;
using PixelBoard.Api.V1;
using PixelBoard.Configuration;
using PixelBoard.Infrastructure.Identity;
using PixelBoard.Infrastructure.Postgres;
using PixelBoard.Infrastructure.Realtime;

const string provisionPostgresArgument = "--provision-postgres";
var provisionPostgres = args.Contains(
    provisionPostgresArgument,
    StringComparer.Ordinal);
var applicationArguments = args
    .Where(argument => !string.Equals(
        argument,
        provisionPostgresArgument,
        StringComparison.Ordinal))
    .ToArray();
var builder = WebApplication.CreateBuilder(applicationArguments);

if (provisionPostgres)
{
    await PostgresProvisioner.ProvisionAsync(builder.Configuration);
    return;
}

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddSignalR();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddProductOptions(builder.Configuration, builder.Environment);
builder.Services.AddFirebaseAuthentication();
builder.Services.AddBoardStorage();
builder.Services.AddModerationLedger(builder.Configuration);
builder.Services.AddStoreKitEntitlements(builder.Configuration);
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
        | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    // Azure Container Apps proxies originate from 10.42.0.0/23. Other PaaS
    // ingress layers (Fly.io, Render, Railway) use different proxy ranges, so
    // allow trusting the platform proxy explicitly via configuration instead
    // of hardcoding one cloud's network.
    if (builder.Configuration.GetValue<bool>("ForwardedHeaders:TrustPlatformProxy"))
    {
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
    }
    else
    {
        options.KnownNetworks.Add(
            new Microsoft.AspNetCore.HttpOverrides.IPNetwork(
                IPAddress.Parse("10.42.0.0"),
                23));
    }
});

Console.WriteLine($"Environment: {builder.Environment.EnvironmentName}");

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();
app.MapRazorPages()
   .WithStaticAssets();

app.MapHub<BoardHub>("/boardHub");
app.MapHub<RealtimeBoardHub>("/api/v1/realtime");
app.MapBoardApiV1();
app.MapModerationApiV1();
app.MapStoreKitApiV1();
app.MapAdvertisingMetadata();
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("ready")
});

app.Run();
