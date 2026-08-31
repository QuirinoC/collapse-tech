using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Options;
using TrustApi.Configuration;
using TrustApi.Domain;

namespace TrustApi.Infrastructure.Phone;

public interface ISmsOtpSender
{
    bool IsConfigured { get; }
    Task SendAsync(string e164, string code, CancellationToken cancellationToken);
}

public sealed class TwilioSmsSender(IHttpClientFactory http, IOptions<TwilioOptions> options) : ISmsOtpSender
{
    public bool IsConfigured => options.Value.IsConfigured;

    public async Task SendAsync(string e164, string code, CancellationToken cancellationToken)
    {
        var twilio = options.Value;
        if (!twilio.IsConfigured)
        {
            throw TrustException.OtpNotConfigured();
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://api.twilio.com/2010-04-01/Accounts/{Uri.EscapeDataString(twilio.AccountSid)}/Messages.json");
        var token = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{twilio.AccountSid}:{twilio.AuthToken}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", token);
        var form = new Dictionary<string, string>
        {
            ["To"] = e164,
            ["Body"] = $"Trust code: {code}. Expires in 10 minutes."
        };
        if (!string.IsNullOrWhiteSpace(twilio.MessagingServiceSid))
        {
            form["MessagingServiceSid"] = twilio.MessagingServiceSid.Trim();
        }
        else
        {
            form["From"] = twilio.FromNumber.Trim();
        }

        request.Content = new FormUrlEncodedContent(form);
        using var client = http.CreateClient("twilio");
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw TrustException.OtpSendFailed();
        }
    }
}

public static class PhoneE164
{
    public static bool TryNormalize(string? raw, out string e164)
    {
        e164 = "";
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var trimmed = raw.Trim();
        var digits = new string(trimmed.Where(char.IsDigit).ToArray());
        if (trimmed.StartsWith('+'))
        {
            if (digits.Length is >= 8 and <= 15)
            {
                e164 = "+" + digits;
                return true;
            }

            return false;
        }

        if (digits.Length == 10)
        {
            e164 = "+1" + digits;
            return true;
        }

        if (digits.Length == 11 && digits[0] == '1')
        {
            e164 = "+" + digits;
            return true;
        }

        return false;
    }

    public static string Mask(string e164)
    {
        if (string.IsNullOrEmpty(e164) || e164.Length < 5)
        {
            return "+***";
        }

        return "+***" + e164[^4..];
    }
}
