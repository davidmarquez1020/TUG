import { getCallerUserId, supabaseAdmin, json } from "./_shared/supabaseAdmin.js";

// Operator's half of the two-step completion flow: moves the job to
// "awaiting_confirmation" instead of capturing payment directly. Payment
// only actually moves once the requester separately confirms via
// complete-job — see that file for the second half.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const userId = await getCallerUserId(req);
  if (!userId) return json({ error: "Sign in required." }, 401);

  const { jobId } = await req.json().catch(() => ({}));
  if (!jobId) return json({ error: "Missing jobId." }, 400);

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, status, assigned_operator_id")
    .eq("id", jobId)
    .single();
  if (jobError || !job) return json({ error: "Job not found." }, 404);
  if (job.assigned_operator_id !== userId) return json({ error: "You aren't assigned to this job." }, 403);
  if (job.status !== "recovering") return json({ error: "This job isn't ready to be marked complete yet." }, 400);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("jobs")
    .update({ status: "awaiting_confirmation", operator_completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .select()
    .single();
  if (updateError) return json({ error: "Couldn't update the job." }, 500);

  return json({ job: updated });
};
