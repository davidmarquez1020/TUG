import { supabase } from "./supabaseClient.js";

export async function signUp(email, password, displayName) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || "Anonymous driver" } },
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// fires immediately with the current session, then again on every change
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) {
    console.error("getProfile failed", error);
    return null;
  }
  return data;
}

// user-editable fields only — is_verified is intentionally not settable
// here; the database also enforces this via column privileges.
export async function updateProfile(userId, { display_name, rig, role }) {
  const patch = {};
  if (display_name !== undefined) patch.display_name = display_name;
  if (rig !== undefined) patch.rig = rig;
  if (role !== undefined) patch.role = role;

  const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select().single();
  if (error) {
    console.error("updateProfile failed", error);
    throw error;
  }
  return data;
}
