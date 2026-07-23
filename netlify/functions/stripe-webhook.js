import { stripe } from "./_shared/stripeClient.js";
import { supabaseAdmin } from "./_shared/supabaseAdmin.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object;
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_payouts_enabled: !!account.payouts_enabled })
        .eq("stripe_account_id", account.id);
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      await supabaseAdmin
        .from("jobs")
        .update({ payment_status: "failed" })
        .eq("stripe_payment_intent_id", intent.id);
      break;
    }
    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
