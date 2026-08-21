using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using PixelBoard.Application;
using PixelBoard.Configuration;

namespace PixelBoard.Infrastructure.Identity;

public static class FirebaseAuthenticationExtensions
{
    public static IServiceCollection AddFirebaseAuthentication(
        this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<IAccountIdentityAccessor, FirebaseAccountIdentityAccessor>();
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer();
        services
            .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<FirebaseOptions>>((jwt, firebaseOptions) =>
            {
                var firebase = firebaseOptions.Value;
                jwt.Events ??= new JwtBearerEvents();
                if (!firebase.Enabled)
                {
                    jwt.Events.OnMessageReceived = context =>
                    {
                        context.NoResult();
                        return Task.CompletedTask;
                    };
                    return;
                }

                var issuer = $"https://securetoken.google.com/{firebase.ProjectId}";
                jwt.Authority = issuer;
                jwt.Audience = firebase.ProjectId;
                jwt.MapInboundClaims = false;
                jwt.RequireHttpsMetadata = true;
                jwt.RefreshOnIssuerKeyNotFound = true;
                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = issuer,
                    ValidateAudience = true,
                    ValidAudience = firebase.ProjectId,
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,
                    NameClaimType = "sub",
                    ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
                    ClockSkew = TimeSpan.FromMinutes(2)
                };
                jwt.Events.OnTokenValidated = context =>
                {
                    if (!FirebaseTokenClaims.TryValidate(
                            context.Principal,
                            TimeProvider.System.GetUtcNow(),
                            out var error))
                    {
                        context.Fail(error);
                    }

                    return Task.CompletedTask;
                };
            });

        services.AddAuthorization();
        return services;
    }
}

public static class FirebaseTokenClaims
{
    public static bool TryValidate(
        ClaimsPrincipal? principal,
        DateTimeOffset now,
        out string error)
    {
        var subject = principal?.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(subject))
        {
            error = "Firebase token subject is missing.";
            return false;
        }

        if (!TryReadUnixTime(principal!, "iat", out var issuedAt)
            || !TryReadUnixTime(principal!, "auth_time", out var authenticatedAt))
        {
            error = "Firebase token time claims are missing or invalid.";
            return false;
        }

        var latestAllowed = now.AddMinutes(2);
        if (issuedAt > latestAllowed || authenticatedAt > latestAllowed)
        {
            error = "Firebase token time claims are in the future.";
            return false;
        }

        error = string.Empty;
        return true;
    }

    private static bool TryReadUnixTime(
        ClaimsPrincipal principal,
        string claimType,
        out DateTimeOffset value)
    {
        var claim = principal.FindFirstValue(claimType);
        if (long.TryParse(
                claim,
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var seconds))
        {
            try
            {
                value = DateTimeOffset.FromUnixTimeSeconds(seconds);
                return true;
            }
            catch (ArgumentOutOfRangeException)
            {
            }
        }

        value = default;
        return false;
    }
}

public sealed class FirebaseAccountIdentityAccessor(IHttpContextAccessor httpContextAccessor)
    : IAccountIdentityAccessor
{
    public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var principal = httpContextAccessor.HttpContext?.User;
        var firebaseUid = principal?.Identity?.IsAuthenticated == true
            ? principal.FindFirstValue("sub")
            : null;
        AuthenticatedAccount? account = string.IsNullOrWhiteSpace(firebaseUid)
            ? null
            : new AuthenticatedAccount(
                new AccountId(firebaseUid),
                IsBanned: false,
                CommunityStandardsAccepted: false);

        return ValueTask.FromResult(account);
    }
}
