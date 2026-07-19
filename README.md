# TUG

Stuck on the trail, on the highway, or downtown — TUG connects stranded
drivers with nearby recovery operators who can pull, tow, jump, or fuel
them back up.

This repo is the working prototype: a two-sided marketplace UI (stranded
driver + recovery operator) built in React. It currently uses
`localStorage` as a stand-in backend — see `src/lib/storage.js` for the
seams where Supabase plugs in.

## Stack

- **React + Vite** — frontend
- **Tailwind CSS** — styling
- **Netlify** — hosting + (eventually) serverless functions
- **Supabase** — planned: Postgres database, auth, realtime sync
- **Stripe** — planned: payment capture for completed recoveries

## Getting started

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. The app works standalone right now —
no environment variables are required to try it out — but data only
persists in your own browser (`localStorage`), so "shared board"
behavior between a stranded driver and an operator only works within
the same browser/tab for now.

## Environment variables

Copy `.env.example` to `.env.local` and fill in your own Supabase and
Stripe keys once those are set up:

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

- [ ] Wire `src/lib/storage.js` to Supabase (schema is sketched in that file's comments)
- [ ] Supabase Realtime subscriptions to replace the current polling intervals
- [ ] Supabase Auth for requesters and recovery operators
- [ ] Operator verification / insurance-on-file flow before an account can accept jobs
- [ ] Stripe payment capture on job completion (likely via a Netlify Function to keep the secret key server-side)
- [ ] Real geolocation instead of the randomly generated demo coordinates
- [ ] Distance/difficulty/equipment-based pricing instead of flat per-situation payouts
