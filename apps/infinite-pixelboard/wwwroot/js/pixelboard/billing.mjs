export function parseBillingReturn(search) {
  const value = new URLSearchParams(search).get("billing");
  return value === "success" || value === "cancel" || value === "manage"
    ? value
    : null;
}

export function stripBillingParam(href) {
  const url = new URL(href, "https://pixelboard.collapsetechnologies.com");
  url.searchParams.delete("billing");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function billingStatusMessage(result, { hasCustomer = false, isPro = false } = {}) {
  if (result === "success") {
    return isPro
      ? "Pro is on. Paint cooldown is 1 second."
      : "Payment received. Pro activates when Stripe confirms the subscription.";
  }
  if (result === "cancel") {
    return "Checkout was canceled. You were not charged.";
  }
  if (result === "manage") {
    return "Billing settings were updated.";
  }
  return "";
}
