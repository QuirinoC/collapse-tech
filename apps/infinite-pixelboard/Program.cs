using Microsoft.Azure.SignalR;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddSignalR();

Console.WriteLine($"Environment: {builder.Environment.EnvironmentName}");

if (builder.Environment.IsProduction())
{
    // Get redisconnectionstring from Env
    var redisConnString = Environment.GetEnvironmentVariable("redisconnectionstring")
        ?? builder.Configuration["redisconnectionstring"];

    if (string.IsNullOrEmpty(redisConnString))
    {
        throw new RedisException("Redis connection string not found in environment variables or configuration");
    }

    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnString;
        options.InstanceName = "PixelBoard_";
    });
}
else
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = "localhost:6379"; // Replace with your Redis connection string
        options.InstanceName = "PixelBoard_";
    });
}


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

app.UseAuthorization();

app.MapStaticAssets();
app.MapRazorPages()
   .WithStaticAssets();

app.MapHub<BoardHub>("/boardHub");

app.Run();
