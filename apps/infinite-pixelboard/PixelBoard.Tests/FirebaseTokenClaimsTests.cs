using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Infrastructure.Identity;

namespace PixelBoard.Tests;

public sealed class FirebaseTokenClaimsTests
{
    [Fact]
    public void ValidFirebaseClaimsAreAccepted()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var principal = CreatePrincipal(
            "firebase-user",
            now.AddMinutes(-5),
            now.AddHours(-1));

        var valid = FirebaseTokenClaims.TryValidate(principal, now, out var error);

        Assert.True(valid);
        Assert.Empty(error);
    }

    [Fact]
    public void MissingSubjectIsRejected()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var principal = CreatePrincipal(null, now, now);

        var valid = FirebaseTokenClaims.TryValidate(principal, now, out var error);

        Assert.False(valid);
        Assert.Contains("subject", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FutureAuthenticationTimeIsRejected()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var principal = CreatePrincipal(
            "firebase-user",
            now,
            now.AddMinutes(3));

        var valid = FirebaseTokenClaims.TryValidate(principal, now, out var error);

        Assert.False(valid);
        Assert.Contains("future", error, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("iat", null)]
    [InlineData("iat", "not-a-timestamp")]
    [InlineData("auth_time", null)]
    [InlineData("auth_time", "not-a-timestamp")]
    public void MissingOrInvalidTimeClaimIsRejected(string claimType, string? value)
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var claims = new List<Claim>
        {
            new("sub", "firebase-user"),
            new("iat", now.ToUnixTimeSeconds().ToString()),
            new("auth_time", now.ToUnixTimeSeconds().ToString())
        };
        claims.RemoveAll(claim => claim.Type == claimType);
        if (value is not null)
        {
            claims.Add(new Claim(claimType, value));
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "firebase"));
        var valid = FirebaseTokenClaims.TryValidate(principal, now, out var error);

        Assert.False(valid);
        Assert.Contains("time claims", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task IdentityAccessorReturnsAuthenticatedFirebaseAccount()
    {
        var httpContext = new DefaultHttpContext
        {
            User = CreatePrincipal(
                "firebase-user",
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow)
        };
        var accessor = new FirebaseAccountIdentityAccessor(
            new TestHttpContextAccessor { HttpContext = httpContext });

        var account = await accessor.GetCurrentAsync();

        Assert.NotNull(account);
        Assert.Equal(new AccountId("firebase-user"), account.Id);
        Assert.False(account.IsBanned);
        Assert.False(account.CommunityStandardsAccepted);
    }

    [Fact]
    public async Task IdentityAccessorReturnsNullForAnonymousPrincipal()
    {
        var accessor = new FirebaseAccountIdentityAccessor(
            new TestHttpContextAccessor
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity())
                }
            });

        var account = await accessor.GetCurrentAsync();

        Assert.Null(account);
    }

    [Fact]
    public async Task DisabledFirebaseSuppressesBearerAuthentication()
    {
        var services = new ServiceCollection();
        services.AddOptions<FirebaseOptions>()
            .Configure(options => options.Enabled = false);
        services.AddFirebaseAuthentication();
        using var provider = services.BuildServiceProvider();

        var options = provider
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(JwtBearerDefaults.AuthenticationScheme);
        var context = new MessageReceivedContext(
            new DefaultHttpContext { RequestServices = provider },
            new Microsoft.AspNetCore.Authentication.AuthenticationScheme(
                JwtBearerDefaults.AuthenticationScheme,
                null,
                typeof(JwtBearerHandler)),
            options);

        await options.Events.OnMessageReceived(context);

        Assert.True(context.Result?.None);
    }

    private static ClaimsPrincipal CreatePrincipal(
        string? subject,
        DateTimeOffset issuedAt,
        DateTimeOffset authenticatedAt)
    {
        var claims = new List<Claim>
        {
            new("iat", issuedAt.ToUnixTimeSeconds().ToString()),
            new("auth_time", authenticatedAt.ToUnixTimeSeconds().ToString())
        };
        if (subject is not null)
        {
            claims.Add(new Claim("sub", subject));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "firebase"));
    }

    private sealed class TestHttpContextAccessor : IHttpContextAccessor
    {
        public HttpContext? HttpContext { get; set; }
    }
}
