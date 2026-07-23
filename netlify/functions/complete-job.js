import { stripe, PLATFORM_FEE_PCT } from "./_shared/stripeClient.js";
import { getCallerUserId, supabaseAdmin, json } from "./_shared/supabaseAdmin.js";

// Captures the held payment and pays the operator (minus the platform fee)
// in one server-side step, so a job can never end up "complete" without
// payment actually having moved.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Sign in required." }, 401);

  const { jobId } = await req.json().catch(() => ({}));
  if (!jobId) return json({ error: "Missing jobId." }, 400);

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, status, payout, assigned_operator_id, stripe_payment_intent_id")
    .eq("id", jobId)
    .single();
  if (jobError || !job) return json({ error: "Job not found." }, 404);
  if (job.assigned_operator_id !== userId) return json({ error: "You aren't assigned to this job." }, 403);
  if (job.status === "complete") return json({ error: "Job is already complete." }, 400);
  if (!job.stripe_payment_intent_id) return json({ error: "No payment on file for this job." }, 400);

  const { data: operator, error: opError } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_enabled")
    .eq("id", userId)
    .single();
  if (opError || !operator?.stripe_account_id || !operator.stripe_payouts_enabled) {
    return json({ error: "Set up payouts before completing jobs." }, 400);
  }

  const captured = await stripe.paymentIntents.capture(job.stripe_payment_intent_id);

  // derive the operator's cut from the actual captured amount, not the
  // client-writable jobs.payout display column — otherwise a tampered
  // payout value could pay an operator more than was ever charged.
  const operatorCut = Math.round(captured.amount * (1 - PLATFORM_FEE_PCT));
  const transfer = await stripe.transfers.create({
    amount: operatorCut,
    currency: "usd",
    destination: operator.stripe_account_id,
    source_transaction: captured.latest_charge,
    metadata: { job_id: jobId },
  });

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("jobs")
    .update({ status: "complete", payment_status: "captured", stripe_transfer_id: transfer.id })
    .eq("id", jobId)
    .select()
    .single();
  if (updateError) return json({ error: "Payment captured but failed to update the job — contact support." }, 500);

  return json({ job: updated });
};
