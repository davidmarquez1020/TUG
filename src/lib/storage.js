import { supabase } from "./supabaseClient.js";

// jobs.requester_id and jobs.assigned_operator_id both point at profiles,
// so the two joins need explicit foreign-key hints to disambiguate.
const JOB_SELECT = `
  *,
  requester:profiles!jobs_requester_id_fkey(display_name),
  assigned:profiles!jobs_assigned_operator_id_fkey(display_name, rig)
`;

function mapJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    requesterId: row.requester_id,
    requester: row.requester?.display_name || "Anonymous driver",
    vehicle: row.vehicle,
    situation: row.situation,
    equipment: row.equipment || [],
    notes: row.notes || "",
    coords: row.coords_label,
    lat: row.lat,
    lng: row.lng,
    operatorLat: row.operator_lat,
    operatorLng: row.operator_lng,
    distance: row.distance,
    payout: row.payout,
    status: row.status,
    paymentStatus: row.payment_status,
    assignedOperatorId: row.assigned_operator_id,
    assignedUnit: row.assigned_operator_id
      ? { name: row.assigned?.display_name || "Recovery unit", rig: row.assigned?.rig || "" }
      : null,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ---------- reads ----------

export async function loadJob(id) {
  const { data, error } = await supabase.from("jobs").select(JOB_SELECT).eq("id", id).single();
  if (error) {
    console.error("loadJob failed", error);
    return null;
  }
  return mapJobRow(data);
}

// RLS already limits this to: open jobs, jobs you posted, and jobs
// assigned to you — no extra filtering needed here.
export async function loadAllJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("loadAllJobs failed", error);
    return [];
  }
  return data.map(mapJobRow);
}

// ---------- writes ----------

export async function createJob(userId, job) {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      requester_id: userId,
      vehicle: job.vehicle,
      situation: job.situation,
      equipment: job.equipment,
      notes: job.notes,
      coords_label: job.coords,
      lat: job.lat,
      lng: job.lng,
      distance: job.distance,
      payout: job.payout,
      status: "open",
      stripe_payment_intent_id: job.stripePaymentIntentId,
    })
    .select(JOB_SELECT)
    .single();
  if (error) {
    console.error("createJob failed", error);
    throw error;
  }
  return mapJobRow(data);
}

// only succeeds if the job is still open/unassigned and the caller's
// profile has is_verified = true — both enforced by RLS, not just the UI
export async function acceptJob(jobId, operatorId) {
  const { data, error } = await supabase
    .from("jobs")
    .update({ assigned_operator_id: operatorId, status: "accepted" })
    .eq("id", jobId)
    .select(JOB_SELECT)
    .single();
  if (error) {
    console.error("acceptJob failed", error);
    throw error;
  }
  return mapJobRow(data);
}

export async function advanceJobStatus(jobId, nextStatus) {
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: nextStatus })
    .eq("id", jobId)
    .select(JOB_SELECT)
    .single();
  if (error) {
    console.error("advanceJobStatus failed", error);
    throw error;
  }
  return mapJobRow(data);
}

// pings the operator's current position while a job is active — throttled
// client-side by the caller, not fire-and-throw since this runs silently
// in the background off a geolocation watch
export async function updateOperatorLocation(jobId, lat, lng) {
  const { error } = await supabase
    .from("jobs")
    .update({ operator_lat: lat, operator_lng: lng })
    .eq("id", jobId);
  if (error) console.error("updateOperatorLocation failed", error);
}

// ---------- Stripe (Netlify Functions) ----------
// These call server-side functions that hold the Stripe secret key and the
// Supabase service role key — neither of which can ever live in the
// browser bundle. See netlify/functions/.

async function callFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${name} failed`);
  return data;
}

// authorizes (holds) the card for a job's payout amount before it's created
export async function createPaymentIntent(situation) {
  return callFunction("create-payment-intent", { situation });
}

// operator's half of the two-step completion flow — moves the job to
// "awaiting_confirmation", no payment action yet
export async function requestCompletion(jobId) {
  const { job } = await callFunction("request-completion", { jobId });
  return mapJobRow(job);
}

// requester's half — captures the held payment and transfers the
// operator's cut in one step, only once they confirm after the operator
// has already requested completion
export async function completeJob(jobId) {
  const { job } = await callFunction("complete-job", { jobId });
  return mapJobRow(job);
}

// releases the payment hold and cancels an open (not yet accepted) job
export async function cancelPayment(jobId) {
  return callFunction("cancel-payment", { jobId });
}

// creates (if needed) a Stripe Express connected account for an operator
// and returns a URL to Stripe's hosted onboarding flow
export async function createConnectAccount() {
  return callFunction("create-connect-account", {});
}

// re-checks the operator's Connect account status directly with Stripe —
// called when they land back on the app after hosted onboarding, since
// waiting on a webhook isn't reliable/fast enough for that moment
export async function syncConnectStatus() {
  return callFunction("sync-connect-status", {});
}

// ---------- realtime ----------
// Postgres change payloads don't include our joined profile data, so on
// any change we just signal the caller to refetch rather than trying to
// reconstruct the joined row client-side.

export function subscribeToJob(jobId, onChange) {
  const channel = supabase
    .channel(`job-${jobId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
      () => onChange()
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToJobsBoard(onChange) {
  const channel = supabase
    .channel("jobs-board")
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => onChange())
    .subscribe();
  return () => supabase.removeChannel(channel);
}
