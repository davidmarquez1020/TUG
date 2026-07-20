# TUG

Stuck on the trail, on the highway, or downtown — TUG connects stranded
drivers with nearby recovery operators who can pull, tow, jump, or fuel
them back up.

This repo is the working prototype: a two-sided marketplace UI (stranded
driver + recovery operator) built in React, backed by Supabase for auth,
the database, and realtime sync.

## Stack

- **React + Vite** — frontend
- **Tailwind CSS** — styling
- **Netlify** — hosting + (eventually) serverless functions
- **Supabase** — auth, Postgres database, realtime sync (wired in)
- **Stripe** — planned: payment capture for completed recoveries

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

Opens at `http://localhost:5173`. You'll need a Supabase project with the
schema from `supabase_schema.sql` (in the repo root, or wherever you saved
it) applied via the SQL Editor before sign-up/sign-in and the job board
will work.

New accounts default to unverified (`profiles.is_verified = false`), so
they can browse the recovery board but can't accept jobs. Flip that flag
manually in the Supabase dashboard's Table Editor for now — that's the
whole "operator verification" flow until something more automated
replaces it.

## Environment variables

Copy `.env.example` to `.env.local` and fill in your own Supabase and
Stripe keys:

```bash
cp .env.example .env.local
```

## Deploying to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site -> Import an existing project -> GitHub**, pick this repo.
3. Build command: `npm run build` — publish directory: `dist` (already set in `netlify.toml`).
4. Add your `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_STRIPE_PUBLISHABLE_KEY` under Site settings -> Environment variables once you have them.
5. Deploy.

## Roadmap

- [x] Wire `src/lib/storage.js` to Supabase
- [x] Supabase Realtime subscriptions to replace the old polling intervals
- [x] Supabase Auth for requesters and recovery operators
- [x] Manual operator verification gate (`profiles.is_verified`, flipped via dashboard)
- [ ] Actual operator verification flow (insurance/ID upload + review), not just a manual flag
- [ ] Stripe payment capture on job completion (likely via a Netlify Function to keep the secret key server-side)
- [ ] Real geolocation instead of the randomly generated demo coordinates
- [ ] Distance/difficulty/equipment-based pricing instead of flat per-situation payouts
- [ ] Server-side enforcement of valid job status transitions (RLS currently checks *who*, not the full state machine)
