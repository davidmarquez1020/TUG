import { stripe } from "./_shared/stripeClient.js";
import { getCallerUserId, supabaseAdmin, json } from "./_shared/supabaseAdmin.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Sign in required." }, 401);

  const { jobId } = await req.json().catch(() => ({}));
  if (!jobId) return json({ error: "Missing jobId." }, 400);

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, status, requester_id, stripe_payment_intent_id")
    .eq("id", jobId)
    .single();
  if (jobError || !job) return json({ error: "Job not found." }, 404);
  if (job.requester_id !== userId) return json({ error: "This isn't your request." }, 403);
  if (job.status !== "open") return json({ error: "Only open requests can be cancelled." }, 400);

  if (job.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(job.stripe_payment_intent_id);
    } catch (err) {
      // already canceled/captured on Stripe's side — don't block the job
      // cancellation on this, the payment_status column is the source of
      // truth for the UI either way.
      console.error("Stripe PaymentIntent cancel failed", err);
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("jobs")
    .update({ status: "cancelled", payment_status: "canceled" })
    .eq("id", jobId);
  if (updateError) return json({ error: "Couldn't cancel the request." }, 500);

  return json({ ok: true });
};
