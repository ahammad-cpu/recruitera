# Database Design — Sign Up & Create Account v2.0

**Source PRD:** [PRD: Sign Up & Create Account v2.0](https://icareerhubproduct.atlassian.net/wiki/spaces/IB/pages/126353410)
**Date:** 2026-06-14
**Scope:** Sign-up flow only (no sessions, billing, audit logging).
**Target:** Database-agnostic logical schema. Implementer picks the engine (Postgres recommended).

---

## 1. Goals

Model the data created by the 3-step wizard:

1. Step 1 — Company Info (name, website)
2. Step 2 — Personal Info + inline email verification (or OAuth)
3. Step 3 — Workspace Setup + data preference + trial start

The PRD's open question pins the **user record creation point at end of Step 2**, so the schema must support a partial/incomplete onboarding state between Step 2 and Step 3 Finish.

## 2. Entities

```
organization ──< user ──< email_verification_code
                  │
                  └──< oauth_identity
```

| Entity | Purpose |
|---|---|
| `organization` | The company. Created with the first user at Step 2 submit. Holds workspace-setup answers, trial dates, and data-preference state. |
| `user` | A person/login. First user of an org is the Company Admin (RC-91). |
| `email_verification_code` | 6-digit codes for the password sign-up path. 15-min expiry, 1 resend/min throttle. Not used by OAuth. |
| `oauth_identity` | Google/Microsoft identity bound to a user. Presence implies auto-verified email. |

### Design decisions

- **Onboarding state is a status field**, not a separate progress table. `organization.onboarding_status` is the single source of truth for "is this org through the wizard?".
- **Trial is folded into `organization`** (`trial_started_at`, `trial_ends_at`). No subscription/billing table — out of scope.
- **Two distinct "role" concepts are kept separate** on `user`: `account_role` (permissions: company_admin/member) vs `position` (profile answer: Recruiter/CEO/…).
- **Business-email blocklist lives in the app layer**, not the schema. Schema accepts any string; validation rejects free providers before insert.
- **Codes are stored hashed** (`code_hash`), never plaintext.

## 3. Tables

### 3.1 `organization`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `name` | text, not null | Step 1 |
| `website` | text, not null | Step 1 |
| `company_size` | enum (`1_10`,`11_50`,`51_200`,`201_500`,`500_plus`), nullable | Step 3, optional |
| `industry` | text, nullable | Step 3, optional |
| `used_ats_before` | bool, nullable | Step 3, optional |
| `data_preference` | enum (`sample`,`fresh`), nullable until Finish | Required to enable Finish |
| `sample_data_seed_status` | enum (`not_requested`,`pending`,`seeded`,`failed`), default `not_requested` | Drives dashboard loading state |
| `onboarding_status` | enum (`pending_workspace`,`active`), default `pending_workspace` | Flips to `active` on Finish |
| `trial_started_at` | timestamptz, nullable | Set on Finish |
| `trial_ends_at` | timestamptz, nullable | `trial_started_at + 18 days` |
| `created_at` | timestamptz, default now() | |
| `updated_at` | timestamptz, default now() | |

### 3.2 `user`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `organization_id` | uuid, fk → `organization.id`, not null | |
| `full_name` | text, not null | Step 2 (or OAuth profile) |
| `email` | text, not null, **unique** | Business email; uniqueness drives UC-05 "already registered" |
| `phone_e164` | text, nullable | E.164; Egypt default in UI |
| `password_hash` | text, nullable | Null for OAuth-only users |
| `position` | enum (`recruiter`,`ceo`,`head_of_hr`,`product_manager`,`hiring_manager`), nullable | Step 3, optional |
| `account_role` | enum (`company_admin`,`member`), default `company_admin` for first user | RC-91 |
| `email_verified` | bool, default false | True after code OR OAuth |
| `email_verified_at` | timestamptz, nullable | |
| `signup_method` | enum (`password`,`google`,`microsoft`), not null | |
| `created_at` | timestamptz, default now() | |
| `updated_at` | timestamptz, default now() | |

### 3.3 `email_verification_code`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `user_id` | uuid, fk → `user.id`, not null | |
| `code_hash` | text, not null | Hashed 6-digit code |
| `expires_at` | timestamptz, not null | `created_at + 15 min` |
| `consumed_at` | timestamptz, nullable | Set when code is successfully used |
| `created_at` | timestamptz, default now() | Used by app to enforce 1-resend/min throttle |

### 3.4 `oauth_identity`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `user_id` | uuid, fk → `user.id`, not null | |
| `provider` | enum (`google`,`microsoft`), not null | |
| `provider_subject` | text, not null | Stable provider user id (`sub` for Google, `oid` for Microsoft) |
| `created_at` | timestamptz, default now() | |

**Unique:** (`provider`, `provider_subject`)

## 4. Indexes

- `user.email` — unique (drives UC-05 lookup)
- `user.organization_id`
- `email_verification_code (user_id, created_at desc)` — newest-first lookup + throttle check
- `oauth_identity (user_id)`

## 5. Flow → writes

### Password path (UC-01)

1. **Step 2 submit:**
   - Insert `organization` with `name`, `website`, `onboarding_status='pending_workspace'`.
   - Insert `user` with `email_verified=false`, `account_role='company_admin'`, `signup_method='password'`, `password_hash`.
   - Insert `email_verification_code` with hashed code, `expires_at = now() + 15 min`.
2. **Code verified:** Update `user` → `email_verified=true`, `email_verified_at=now()`; mark code `consumed_at=now()`.
3. **Step 3 Finish:** Update `organization` with workspace answers, `data_preference`, `trial_started_at=now()`, `trial_ends_at=now()+18d`, `onboarding_status='active'`. If `data_preference='sample'`, set `sample_data_seed_status='pending'` and trigger the async seeder.

### OAuth path (UC-02, UC-03)

1. **OAuth callback:**
   - Insert `organization` (`onboarding_status='pending_workspace'`).
   - Insert `user` with `email_verified=true`, `email_verified_at=now()`, `signup_method='google'|'microsoft'`, `password_hash=null`.
   - Insert `oauth_identity` row.
   - No verification-code row.
2. **Step 3 Finish:** Same as password path step 3.

### Duplicate email (UC-05)

App checks `user.email` uniqueness before insert (or relies on unique-constraint violation) → returns "This email is already registered" and routes to login. No row is created.

## 6. State invariants

- `email_verified=true` iff (`oauth_identity` exists for user) OR (a `email_verification_code` for user has non-null `consumed_at`).
- `organization.onboarding_status='active'` iff `trial_started_at IS NOT NULL` AND `data_preference IS NOT NULL`.
- `user.password_hash IS NULL` iff `signup_method ≠ 'password'`.
- First user of an org has `account_role='company_admin'`. (Enforced in app layer for v1; later admin management is out of scope here.)

## 7. Out of scope

- Sessions / refresh tokens
- Subscription/billing beyond the 18-day trial fields
- Audit log
- Additional identity providers
- Multi-user invitation (only the founder user is created during sign-up)
- Advanced 2FA

## 8. Open items

None in the schema itself. The PRD's open question ("when is the user created?") is resolved by the design: at Step 2 submit, with `onboarding_status='pending_workspace'`.
