using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TrustApi.Configuration;
using TrustApi.Domain;
using TrustApi.Infrastructure.Identity;
using TrustApi.Infrastructure.Phone;

namespace TrustApi.Application;

public sealed record PhoneCodeSendResult(
    DateTimeOffset ExpiresAt,
    int ResendAfterSeconds,
    string? DevelopmentCode);

public sealed class PhoneVerificationService(
    ITrustStore store,
    ISmsOtpSender sms,
    AuthOptions auth,
    TimeProvider time,
    IHostEnvironment environment,
    ILogger<PhoneVerificationService> logger)
{
    public const int CodeTtlSeconds = 10 * 60;
    public const int ResendCooldownSeconds = 45;
    public const int MaxAttempts = 5;
    public const int MaxSendsPerHour = 8;

    public async Task<PhoneCodeSendResult> SendAsync(
        Guid accountId,
        string? rawPhone,
        CancellationToken cancellationToken)
    {
        _ = await RequireAccount(accountId, cancellationToken);
        if (!PhoneE164.TryNormalize(rawPhone, out var e164))
        {
            throw TrustException.InvalidPhone();
        }

        var owner = await store.FindByVerifiedPhoneAsync(e164, cancellationToken);
        if (owner is not null && owner.Id != accountId)
        {
            throw TrustException.PhoneInUse();
        }

        var now = time.GetUtcNow();
        var existing = await store.GetPhoneChallengeAsync(accountId, cancellationToken);
        var samePhone = existing is not null
            && string.Equals(existing.PhoneE164, e164, StringComparison.Ordinal);
        var windowStarted = samePhone ? existing!.WindowStartedAt : now;
        var sendCount = samePhone ? existing!.SendCount : 0;
        if (now - windowStarted >= TimeSpan.FromHours(1))
        {
            windowStarted = now;
            sendCount = 0;
        }

        if (sendCount >= MaxSendsPerHour)
        {
            throw TrustException.OtpCooldown();
        }

        if (samePhone && now - existing!.SentAt < TimeSpan.FromSeconds(ResendCooldownSeconds))
        {
            throw TrustException.OtpCooldown();
        }

        var allowBypass = environment.IsDevelopment() && !sms.IsConfigured;
        if (!sms.IsConfigured && !allowBypass)
        {
            throw TrustException.OtpNotConfigured();
        }

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var challenge = new PhoneChallenge(
            accountId,
            e164,
            Hash(accountId, e164, code),
            now.AddSeconds(CodeTtlSeconds),
            0,
            now,
            sendCount + 1,
            windowStarted);
        await store.UpsertPhoneChallengeAsync(challenge, cancellationToken);

        if (sms.IsConfigured)
        {
            try
            {
                await sms.SendAsync(e164, code, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (TrustException)
            {
                throw;
            }
            catch (Exception)
            {
                throw TrustException.OtpSendFailed();
            }

            logger.LogInformation(
                "Sent phone verification SMS to {Phone} for account {AccountId}.",
                PhoneE164.Mask(e164),
                accountId);
            return new PhoneCodeSendResult(challenge.ExpiresAt, ResendCooldownSeconds, null);
        }

        logger.LogInformation(
            "Development phone verification bypass for {Phone} account {AccountId}; SMS was not sent.",
            PhoneE164.Mask(e164),
            accountId);
        return new PhoneCodeSendResult(challenge.ExpiresAt, ResendCooldownSeconds, code);
    }

    public async Task VerifyAsync(
        Guid accountId,
        string? rawPhone,
        string? rawCode,
        CancellationToken cancellationToken)
    {
        _ = await RequireAccount(accountId, cancellationToken);
        if (!PhoneE164.TryNormalize(rawPhone, out var e164))
        {
            throw TrustException.InvalidPhone();
        }

        var code = (rawCode ?? "").Trim();
        if (code.Length != 6 || !code.All(char.IsDigit))
        {
            throw TrustException.OtpInvalid();
        }

        var challenge = await store.GetPhoneChallengeAsync(accountId, cancellationToken);
        var now = time.GetUtcNow();
        if (challenge is null
            || !string.Equals(challenge.PhoneE164, e164, StringComparison.Ordinal)
            || challenge.ExpiresAt <= now)
        {
            throw TrustException.OtpExpired();
        }

        if (challenge.Attempts >= MaxAttempts)
        {
            await store.ClearPhoneChallengeAsync(accountId, cancellationToken);
            throw TrustException.OtpExhausted();
        }

        var expected = Hash(accountId, e164, code);
        if (!FixedEquals(challenge.CodeHash, expected))
        {
            var attempts = challenge.Attempts + 1;
            if (attempts >= MaxAttempts)
            {
                await store.ClearPhoneChallengeAsync(accountId, cancellationToken);
                throw TrustException.OtpExhausted();
            }

            await store.UpsertPhoneChallengeAsync(challenge with { Attempts = attempts }, cancellationToken);
            throw TrustException.OtpInvalid();
        }

        var owner = await store.FindByVerifiedPhoneAsync(e164, cancellationToken);
        if (owner is not null && owner.Id != accountId)
        {
            throw TrustException.PhoneInUse();
        }

        await store.SetVerifiedPhoneAsync(accountId, e164, now, cancellationToken);
        await store.ClearPhoneChallengeAsync(accountId, cancellationToken);
        logger.LogInformation(
            "Verified phone {Phone} for account {AccountId}.",
            PhoneE164.Mask(e164),
            accountId);
    }

    private async Task<Account> RequireAccount(Guid accountId, CancellationToken cancellationToken) =>
        await store.FindAccountAsync(accountId, cancellationToken)
        ?? throw TrustException.Unauthorized();

    private string Hash(Guid accountId, string e164, string code)
    {
        var key = Encoding.UTF8.GetBytes(SessionIssuer.RequireKey(auth.SigningKey));
        var payload = Encoding.UTF8.GetBytes($"{accountId:N}:{e164}:{code}");
        return Convert.ToHexString(HMACSHA256.HashData(key, payload));
    }

    private static bool FixedEquals(string left, string right)
    {
        var a = Encoding.UTF8.GetBytes(left);
        var b = Encoding.UTF8.GetBytes(right);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
}
