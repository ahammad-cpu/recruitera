# Staging Environment Runbook

Sets up `staging-crm.recruitera.ai` pointing at a brand-new isolated Supabase project. Team trains tomorrow without touching production data.

Estimated time: **45–60 min**, almost all of it waiting.

---

## Step 1 — Create the staging Supabase project (5 min)

1. Go to https://supabase.com/dashboard/projects → **New project**
2. Name: `recruitera-staging`
3. Region: **Europe (Frankfurt)** — same as prod for latency
4. Database password: generate a strong one, save it in 1Password
5. Wait ~2 min for it to provision

Once provisioned, from **Settings → API** copy two values:
- **Project URL**: `https://<ref>.supabase.co`  ← I'll call this `STAGING_REF`
- **Publishable key** (a.k.a. `anon` key): `sb_publishable_...`

Send me these two strings.

---

## Step 2 — I clone the schema (10 min, my side)

Once you share `STAGING_REF`, I'll run via MCP:
- Apply every migration from prod (32 tables, RLS policies, triggers, functions, default seeds for roles)
- Deploy all 6 edge functions (`bubble-sync`, `merge-duplicates`, `sync-paid-customers`, `sync-marketing-tracking`, `webflow-demo-intake`, `invite-user`)
- Seed **10 fake accounts** across all stages + **3 fake user profiles** + a couple closed deals / active contracts so the team has something to click on

I will **not** copy any real customer data.

---

## Step 3 — Wire the staging URL (10 min)

The `staging` git branch already has `crm.html` set up to switch backends based on hostname. After Step 2 I'll fill in `STAGING_REF` and the publishable key in the placeholder spots.

You do:

1. **Vercel** → your `recruitera` project → Settings → Domains → **Add Domain**
   - Domain: `staging-crm.recruitera.ai`
   - Git branch: `staging`  ← important
2. Vercel will tell you to add a CNAME. In your DNS provider:
   - Add `CNAME staging-crm → cname.vercel-dns.com`
3. Wait ~5 min for DNS propagation. Vercel will go green.
4. Push the `staging` branch — auto-deploys to `staging-crm.recruitera.ai`.

---

## Step 4 — Create test user accounts (5 min)

In the staging Supabase Auth panel:
- Add ~5 invite users by email for whoever's onboarding
- They get a magic-link email; they log into `staging-crm.recruitera.ai`
- They see a yellow **🛠 STAGING ENVIRONMENT** banner at the top of every page so nobody confuses it with prod

---

## Day-to-day after launch

- **Promote a change from staging → prod**: merge `staging` PR into `main`. Vercel auto-deploys prod.
- **Reset staging** (wipe + reseed): I can re-run the bootstrap via MCP in ~5 min.
- **Schema change?** Apply it to staging first, let the team try it, then promote.

---

## What this does NOT do (so you know the limits)

- No automatic data sync from prod to staging — staging is its own world. You have to reseed if you want fresh fixtures.
- No CI tests yet — staging is a manual sandbox.
- The Bubble sync edge functions are deployed but **paused** (per your CTO security note). If you want to test the sync flow on staging, we add a separate `BUBBLE_API_KEY` secret to the staging project.

---

**Next action: create the Supabase project (Step 1) and send me `STAGING_REF` + the publishable key.**
