// Storage abstraction for job data.
//
// Right now this runs on localStorage so the app works standalone in dev
// and on a first Netlify deploy with zero backend setup. Every request
// only syncs within one browser, so "shared" behavior (one tab posting a
// job, another tab accepting it) won't work yet across devices.
//
// TODO(supabase): replace the three functions below with real Supabase
// calls once you wire up a project. The shape of `job` objects (see
// App.jsx) maps directly onto a `jobs` table:
//
//   create table jobs (
//     id text primary key,
//     requester text,
//     vehicle text,
//     situation text,
//     equipment text[],
//     notes text,
//     coords text,
//     distance numeric,
//     payout numeric,
//     status text,
//     assigned_unit jsonb,
//     created_at bigint
//   );
//
// saveJob   -> supabase.from('jobs').upsert(job)
// loadJob   -> supabase.from('jobs').select('*').eq('id', id).single()
// loadAllJobs -> supabase.from('jobs').select('*').order('created_at', { ascending: false })
//
// For live updates across tabs/devices, use Supabase Realtime
// (`supabase.channel(...).on('postgres_changes', ...)`) instead of the
// polling intervals currently used in App.jsx.

const PREFIX = "tug:job:";

export async function saveJob(job) {
  try {
    localStorage.setItem(PREFIX + job.id, JSON.stringify(job));
  } catch (e) {
    console.error("saveJob failed", e);
  }
}

export async function loadJob(id) {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loadAllJobs() {
  try {
    const jobs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) jobs.push(JSON.parse(raw));
      }
    }
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.error("loadAllJobs failed", e);
    return [];
  }
}
