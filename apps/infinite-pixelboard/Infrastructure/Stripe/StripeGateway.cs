using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using Stripe;
using Stripe.BillingPortal;
using Stripe.Checkout;
using CheckoutSession = Stripe.Checkout.Session;
using CheckoutSessionCreateOptions = Stripe.Checkout.SessionCreateOptions;
using PortalSessionCreateOptions = Stripe.BillingPortal.SessionCreateOptions;

namespace PixelBoard.Infrastructure.Stripe;

public sealed class StripeGateway(IOptions<StripeOptions> options) : IStripeBillingGateway
{
    public StripeWebhookParseResult ParseWebhook(string payload, string signature)
    {
        if (string.IsNullOrWhiteSpace(payload) || string.IsNullOrWhiteSpace(signature))
        {
            return StripeWebhookParseResult.Invalid("The Stripe webhook signature is missing.");
        }

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(
                payload,
                signature,
                options.Value.WebhookSecret,
                throwOnApiVersionMismatch: false);
        }
        catch (StripeException exception)
        {
            return StripeWebhookParseResult.Invalid(
                exception.Message ?? "The Stripe webhook signature is invalid.");
        }

        var eventAt = ToUtc(stripeEvent.Created);
        return stripeEvent.Data.Object switch
        {
            CheckoutSession session => new StripeWebhookParseResult(
                true,
                stripeEvent.Type,
                eventAt,
                FirstUid(session.Metadata, session.ClientReferenceId),
                session.CustomerId,
                session.SubscriptionId,
                null),
            Subscription subscription => new StripeWebhookParseResult(
                true,
                stripeEvent.Type,
                eventAt,
                FirstUid(subscription.Metadata, null),
                subscription.CustomerId,
                subscription.Id,
                null),
            Invoice invoice => new StripeWebhookParseResult(
                true,
                stripeEvent.Type,
                eventAt,
                FirstUid(invoice.Metadata, null),
                invoice.CustomerId,
                invoice.Parent?.SubscriptionDetails?.SubscriptionId,
                null),
            _ => new StripeWebhookParseResult(
                true,
                stripeEvent.Type,
                eventAt,
                null,
                null,
                null,
                null)
        };
    }

    public async Task<string> CreateCustomerAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        var customer = await Client().V1.Customers.CreateAsync(
            new CustomerCreateOptions
            {
                Metadata = AccountMetadata(accountId)
            },
            cancellationToken: cancellationToken);
        return customer.Id;
    }

    public async Task<string> CreateCheckoutSessionAsync(
        StripeCheckoutSessionRequest request,
        CancellationToken cancellationToken = default)
    {
        var session = await Client().V1.Checkout.Sessions.CreateAsync(
            new CheckoutSessionCreateOptions
            {
                Mode = "subscription",
                Customer = request.CustomerId,
                ClientReferenceId = request.AccountId.Value,
                SuccessUrl = request.SuccessUrl,
                CancelUrl = request.CancelUrl,
                Metadata = AccountMetadata(request.AccountId),
                SubscriptionData = new SessionSubscriptionDataOptions
                {
                    Metadata = AccountMetadata(request.AccountId)
                },
                LineItems =
                [
                    new SessionLineItemOptions
                    {
                        Price = request.PriceId,
                        Quantity = 1
                    }
                ]
            },
            cancellationToken: cancellationToken);
        return session.Url
            ?? throw new InvalidOperationException("Stripe Checkout did not return a URL.");
    }

    public async Task<string> CreatePortalSessionAsync(
        string customerId,
        string returnUrl,
        CancellationToken cancellationToken = default)
    {
        var session = await Client().V1.BillingPortal.Sessions.CreateAsync(
            new PortalSessionCreateOptions
            {
                Customer = customerId,
                ReturnUrl = returnUrl
            },
            cancellationToken: cancellationToken);
        return session.Url
            ?? throw new InvalidOperationException("Stripe Customer Portal did not return a URL.");
    }

    public async Task<StripeSubscriptionSnapshot?> GetSubscriptionAsync(
        string subscriptionId,
        CancellationToken cancellationToken = default)
    {
        Subscription subscription;
        try
        {
            subscription = await Client().V1.Subscriptions.GetAsync(
                subscriptionId,
                cancellationToken: cancellationToken);
        }
        catch (StripeException exception) when (exception.HttpStatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }

        var item = subscription.Items?.Data?.FirstOrDefault();
        if (item is null || item.CurrentPeriodEnd == default)
        {
            return null;
        }

        return new StripeSubscriptionSnapshot(
            subscription.Id,
            subscription.CustomerId,
            subscription.Status,
            item.Price?.Id,
            ToUtc(item.CurrentPeriodEnd),
            FirstUid(subscription.Metadata, null));
    }

    private StripeClient Client() => new(options.Value.SecretKey);

    private static Dictionary<string, string> AccountMetadata(AccountId accountId) =>
        new() { ["firebase_uid"] = accountId.Value };

    private static string? FirstUid(
        IReadOnlyDictionary<string, string>? metadata,
        string? clientReferenceId)
    {
        if (metadata is not null
            && metadata.TryGetValue("firebase_uid", out var uid)
            && !string.IsNullOrWhiteSpace(uid))
        {
            return uid;
        }

        return string.IsNullOrWhiteSpace(clientReferenceId) ? null : clientReferenceId;
    }

    private static DateTimeOffset ToUtc(DateTime value)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
        return new DateTimeOffset(utc);
    }
}
