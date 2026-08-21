using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using PixelBoard.Api.V1;
using PixelBoard.Configuration;
using PixelBoard.Infrastructure.Identity;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddSignalR();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddProductOptions(builder.Configuration, builder.Environment);
builder.Services.AddFirebaseAuthentication();
builder.Services.AddBoardStorage();
builder.Services.AddModerationLedger(builder.Configuration);
builder.Services.AddStoreKitEntitlements(builder.Configuration);

Console.WriteLine($"Environment: {builder.Environment.EnvironmentName}");

var app = builder.Build();

// Configure the HTTP request pipeline.
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
app.MapBoardApiV1();
app.MapStoreKitApiV1();
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("ready")
});

app.Run();
