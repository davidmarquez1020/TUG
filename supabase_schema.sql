-- TUG — Supabase schema
-- Run this once in Project -> SQL Editor -> New query -> Run.
-- Safe to re-run: uses "if not exists" / "or replace" where possible.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles
-- One row per user (requester and/or recovery operator). Extends
-- auth.users rather than duplicating it — id is a foreign key straight
-- to the Supabase auth table.
-- ---------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'requester' check (role in ('requester', 'operator', 'both')),
  display_name text not null default 'Anonymous driver',
  rig text,                              -- e.g. "Ram 2500 w/ 12k winch" — operators only
  is_verified boolean not null default false,  -- operators must be verified before accepting jobs
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Anyone signed in can see basic profile info (needed so a requester
-- can see the name/rig of the operator assigned to their job, and vice
-- versa). No sensitive data lives here, so this is intentionally open.
-- Revisit if you add fields like phone/email/address to this table.
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Column-level lock: users can update their own display_name/rig/role,
-- but cannot flip is_verified on themselves — that must be set by an
-- admin (via the Supabase dashboard, or a service-role script/edge
-- function you control), never from the client.
revoke update on profiles from authenticated;
grant update (display_name, rig, role) on profiles to authenticated;

-- Auto-create a profile row whenever someone signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Anonymous driver'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- jobs
-- One row per recovery request. Status is a simple state machine:
-- open -> accepted -> en_route -> on_scene -> recovering -> complete
-- (or open -> cancelled)
-- ---------------------------------------------------------------------

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles (id),
  assigned_operator_id uuid references profiles (id),

  vehicle text not null,                 -- 'car' | 'truck' | 'suv' | 'utv' | 'bike'
  situation text not null,               -- 'mud' | 'sand' | 'highcentered' | 'water' | 'battery' | 'fuel' | 'flat'
  equipment text[] not null default '{}',
  notes text,

  -- location: lat/lng for when real geolocation lands; coords_label is
  -- a human-readable fallback the current demo build already fills in
  lat numeric(9, 6),
  lng numeric(9, 6),
  coords_label text,

  distance numeric,
  payout numeric not null,

  status text not null default 'open'
    check (status in ('open', 'accepted', 'en_route', 'on_scene', 'recovering', 'complete', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on jobs (status);
create index if not exists jobs_requester_idx on jobs (requester_id);
create index if not exists jobs_operator_idx on jobs (assigned_operator_id);

alter table jobs enable row level security;

-- SELECT: open jobs are visible to everyone (that's the public board);
-- a job is also always visible to its own requester and its assigned operator.
create policy "jobs_select"
  on jobs for select
  to authenticated
  using (
    status = 'open'
    or requester_id = auth.uid()
    or assigned_operator_id = auth.uid()
  );

-- INSERT: you can only ever create a job as yourself, starting as 'open'.
create policy "jobs_insert_own"
  on jobs for insert
  to authenticated
  with check (requester_id = auth.uid() and status = 'open');

-- UPDATE: the requester can cancel their own job while it's still open.
create policy "jobs_requester_cancel"
  on jobs for update
  to authenticated
  using (requester_id = auth.uid() and status = 'open')
  with check (requester_id = auth.uid() and status in ('open', 'cancelled'));

-- UPDATE: a verified operator can accept an open, unassigned job, and
-- can advance status on any job already assigned to them.
create policy "jobs_operator_update"
  on jobs for update
  to authenticated
  using (
    assigned_operator_id = auth.uid()
    or (status = 'open' and assigned_operator_id is null)
  )
  with check (
    assigned_operator_id = auth.uid()
    and exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_verified = true
    )
  );

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Realtime: let the frontend subscribe to job changes instead of polling
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table jobs;
