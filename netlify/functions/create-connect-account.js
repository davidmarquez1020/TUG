import { stripe } from "./_shared/stripeClient.js";
import { getCallerUserId, supabaseAdmin, json } from "./_shared/supabaseAdmin.js";

// Netlify sets URL to the site's live/deploy-preview origin automatically;
// falls back to the local netlify dev port.
const SITE_URL = process.env.URL || "http://localhost:8888";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Sign in required." }, 401);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", userId)
    .single();
  if (profileError || !profile) return json({ error: "Profile not found." }, 404);

  let accountId = profile.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { user_id: userId },
    });
    accountId = account.id;
    await supabaseAdmin.from("profiles").update({ stripe_account_id: accountId }).eq("id", userId);
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${SITE_URL}/?connect=refresh`,
    return_url: `${SITE_URL}/?connect=return`,
    type: "account_onboarding",
  });

  return json({ url: accountLink.url });
};
