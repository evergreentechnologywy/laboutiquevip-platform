interface EmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface PaymentEmailInput {
  to: string;
  displayName?: string | null;
  amountCents: number;
  currency: string;
  paymentUrl?: string | null;
}

interface PackageExpirationReminderInput {
  to: string;
  displayName?: string | null;
  packageName: string;
  expiresOn: string;
}

function resolveFromEmail(): string | null {
  const value = process.env.RESEND_FROM_EMAIL?.trim();
  return value && value.length > 0 ? value : null;
}

function resolveBaseUrl(): string {
  return (
    process.env.FRONTEND_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    "https://www.laboutiquevip.net"
  );
}

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency || "USD"}`;
  }
}

export async function sendTransactionalEmail(input: EmailInput): Promise<{ sent: boolean; skipped?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = resolveFromEmail();

  if (!apiKey) {
    return { sent: false, skipped: "missing_api_key" };
  }

  if (!from) {
    return { sent: false, skipped: "missing_from_email" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend request failed: ${response.status} ${body}`.trim());
  }

  return { sent: true };
}

export async function sendPaymentInitiatedEmail(input: PaymentEmailInput): Promise<{ sent: boolean; skipped?: string }> {
  const amount = formatMoney(input.amountCents, input.currency);
  const greeting = input.displayName ? `Hi ${input.displayName},` : "Hi,";
  const dashboardUrl = `${resolveBaseUrl()}/ProviderDashboard`;
  const paymentLine = input.paymentUrl
    ? `Complete your crypto payment here: ${input.paymentUrl}`
    : `Your payment request has been created. Check your dashboard here: ${dashboardUrl}`;

  return sendTransactionalEmail({
    to: input.to,
    subject: "Your La Boutique VIP payment link is ready",
    text: `${greeting}\n\nYour payment request for ${amount} is ready.\n\n${paymentLine}\n\nIf you did not request this, you can ignore this email.`,
  });
}

export async function sendPaymentConfirmedEmail(input: PaymentEmailInput): Promise<{ sent: boolean; skipped?: string }> {
  const amount = formatMoney(input.amountCents, input.currency);
  const greeting = input.displayName ? `Hi ${input.displayName},` : "Hi,";
  const dashboardUrl = `${resolveBaseUrl()}/ProviderDashboard`;

  return sendTransactionalEmail({
    to: input.to,
    subject: "Payment confirmed for your La Boutique VIP listing",
    text: `${greeting}\n\nWe confirmed your crypto payment of ${amount}. Your listing entitlement has been updated.\n\nYou can review your listing here: ${dashboardUrl}`,
  });
}

export async function sendPaymentNeedsReviewEmail(input: PaymentEmailInput): Promise<{ sent: boolean; skipped?: string }> {
  const amount = formatMoney(input.amountCents, input.currency);
  const greeting = input.displayName ? `Hi ${input.displayName},` : "Hi,";
  const dashboardUrl = `${resolveBaseUrl()}/ProviderDashboard`;

  return sendTransactionalEmail({
    to: input.to,
    subject: "Payment received and pending review",
    text: `${greeting}\n\nWe received a payment related to your ${amount} order, but it still needs manual review before entitlement is updated.\n\nWe will follow up if any action is required. Dashboard: ${dashboardUrl}`,
  });
}

export async function sendPackageExpirationReminderEmail(input: PackageExpirationReminderInput): Promise<{ sent: boolean; skipped?: string }> {
  const greeting = input.displayName ? `Hi ${input.displayName},` : "Hi,";
  const dashboardUrl = `${resolveBaseUrl()}/ProviderDashboard?tab=ads`;

  return sendTransactionalEmail({
    to: input.to,
    subject: "Your La Boutique VIP package is expiring soon",
    text: `${greeting}\n\nYour ${input.packageName} listing package expires on ${input.expiresOn}.\n\nRenew or change your package here: ${dashboardUrl}`,
  });
}
