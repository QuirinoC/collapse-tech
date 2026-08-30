export function subscriptionMessage({
  isPro = false,
  trialAvailable = false,
  currentInterval = null,
  entitlementSource = null,
  authenticated = true,
  communityStandardsAccepted = true,
} = {}) {
  if (!authenticated) {
    return "Log in to get Pro for increased limits.";
  }
  if (!communityStandardsAccepted) {
    return "Accept the community standards before subscribing.";
  }
  if (isPro) {
    if (entitlementSource === "storekit") {
      return "Pro is active through Apple. Manage it in Apple subscriptions.";
    }
    if (entitlementSource === "stripe") {
      return "Pro is active through Stripe. Use subscription settings below.";
    }
    return currentInterval === "month"
      ? "Pro is active. Switch to annual billing below when you want the annual rate."
      : "Pro is active.";
  }
  if (trialAvailable === true) {
    return "Try Pro free for 7 days, then choose monthly or annual billing. Pro is one second between pixels and unlocks the extended palette plus custom colors; it does not remove the cooldown.";
  }
  return "Pro is available with monthly or annual billing. It unlocks the extended palette and custom colors; the cooldown remains one second.";
}
