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
    distance: row.distance,
    payout: row.payout,
    status: row.status,
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

export async function cancelJob(jobId) {
  const { error } = await supabase.from("jobs").update({ status: "cancelled" }).eq("id", jobId);
  if (error) {
    console.error("cancelJob failed", error);
    throw error;
  }
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
