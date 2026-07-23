import { stripe } from "./_shared/stripeClient.js";
import { getCallerUserId, supabaseAdmin, json } from "./_shared/supabaseAdmin.js";

// Called when an operator lands back on the app after Stripe's hosted
// Connect onboarding. Re-fetches the account's live status directly rather
// than waiting on webhook delivery, since that needs to be correct the
// moment they return — not whenever an async event happens to arrive.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Sign in required." }, 401);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", userId)
    .single();
  if (profileError || !profile?.stripe_account_id) return json({ error: "No payout account on file." }, 400);

  const account = await stripe.accounts.retrieve(profile.stripe_account_id);
  const payoutsEnabled = !!account.payouts_enabled;

  await supabaseAdmin
    .from("profiles")
    .update({ stripe_payouts_enabled: payoutsEnabled })
    .eq("id", userId);

  return json({ payoutsEnabled });
};
