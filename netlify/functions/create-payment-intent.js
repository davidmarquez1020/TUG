import { stripe, PAYOUTS } from "./_shared/stripeClient.js";
import { getCallerUserId, json } from "./_shared/supabaseAdmin.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Sign in required." }, 401);

  const { situation } = await req.json().catch(() => ({}));
  const amount = PAYOUTS[situation];
  if (!amount) return json({ error: "Unknown situation." }, 400);

  const intent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: "usd",
    capture_method: "manual",
    metadata: { requester_id: userId, situation },
  });

  return json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount });
};
