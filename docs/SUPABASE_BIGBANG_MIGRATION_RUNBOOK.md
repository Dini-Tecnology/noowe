# Supabase Big Bang Migration Runbook

This runbook turns the migration plan into executable steps for staging and production. Keep staging and production outputs separate, and never commit generated data dumps or secrets.

If you no longer have access to the legacy database, follow `docs/SUPABASE_NO_LEGACY_BOOTSTRAP.md` after applying schema migrations.

## Source Of Truth

- Backend TypeORM runtime config: `platform/backend/src/config/typeorm.config.ts`
- Backend TypeORM CLI config: `platform/backend/src/config/database.config.ts`
- Active migrations: `platform/backend/src/database/migrations`
- Legacy migrations for review only: `platform/backend/src/migrations`
- Supabase project config and migrations: `platform/supabase`

Only `platform/backend/src/database/migrations` is loaded by the current TypeORM configuration. Treat `platform/backend/src/migrations` as historical input when validating parity, not as a second migration chain to execute.

## 1. Generate Inventory

From `platform/backend`, point `DATABASE_*` to the legacy database snapshot that represents the cutover source:

```bash
npm run supabase:migration:inventory
```

The script writes:

- `platform/backend/tmp/supabase-migration/schema-inventory.json`
- `platform/backend/tmp/supabase-migration/migration-chain.json`
- `platform/backend/tmp/supabase-migration/load-order.txt`
- `platform/backend/tmp/supabase-migration/reconciliation-counts.sql`
- `platform/backend/tmp/supabase-migration/rls-policy-matrix.md`

Review the generated RLS matrix before exposing any operational table through the Supabase Data API.

## 1.1 PR1 Flow Inventory

This PR establishes the cutover map without migrating every mobile screen. Use it as the contract for the next Supabase-only PRs:

| flow | current source | Supabase target | PR1/PR2 status and gap |
| --- | --- | --- | --- |
| users / auth | Mobile Supabase Auth adapters plus legacy Nest HTTP helpers for consent and some profile flows | `auth.users`, `public.users`, `profiles` | Auth/session and profile upsert are already Supabase-backed. `public.users` is read-only mirror data; consent, legal docs, biometric and some user admin flows still call Nest. |
| restaurants / menu | Nest HTTP via `ApiService` | `restaurants`, menu/catalog tables from the consolidated baseline | Bootstrap can create the first restaurant in Supabase. Restaurant discovery, staff restaurant management and menu HTTP flows remain Nest-backed in this slice. |
| orders | Mobile `ApiService` delegates core order create/read/status methods to `supabaseApiAdapter`; KDS, payment, split and add-item flows still use Nest | `orders`, `order_items` | Core order methods have Supabase contracts. `order_items` are fetched through nested `orders` queries; direct item realtime is intentionally not part of PR1/PR2. |
| reservations | Mobile `ApiService` delegates basic reservation create/read/status/table assignment to `supabaseApiAdapter` | `reservations` | Core reservation methods have Supabase contracts. Guest invites, group reservations and advanced flows remain Nest-backed. |
| waitlist | Nest HTTP for queue/join/cancel/arrival/family/bar-order flows | `waitlist_entries` | Table, RLS and realtime publication exist. HTTP adapter migration is a follow-up PR. |
| notifications | Nest HTTP for notification CRUD/preferences and push-token registration | `notifications` | Table, own-user RLS and realtime publication exist. HTTP notification CRUD and device-token management remain Nest-backed. |

Do not treat this matrix as permission to expose every generated inventory table. Tables outside the core PR1/PR2 set stay behind RLS with no direct client contract until they receive explicit policies and adapter coverage.

## 2. Build The Supabase Baseline

1. Create a schema-only dump from the legacy source.
2. Normalize extensions and UUID defaults for Supabase (`pgcrypto` / `uuid-ossp`).
3. Apply the consolidated baseline to a fresh Supabase staging database.
4. Apply migrations in timestamp order under `platform/supabase/migrations`, including:
   - `20260427101000_create_core_bootstrap_tables.sql`
   - `20260427115000_public_users_auth_sync.sql` (mirror `auth.users` into `public.users` + trigger)
   - `20260427122300_okinawa_bigbang_bootstrap.sql` (RLS, grants, realtime publication)
5. Run Supabase advisors and fix security/performance findings before loading data.

Do not mix the active and legacy TypeORM migration folders during this step. If production has objects that only exist in the legacy folder, capture them explicitly in the consolidated baseline.

## 3. Load Data

Use the generated `load-order.txt` as the starting order for `COPY` or ETL jobs:

1. Reference/master tables.
2. Tenant tables such as `restaurants`.
3. User/profile and role tables.
4. Operational tables such as menus, tables, reservations, orders and payments.
5. Financial, audit, webhook and analytics tables.

Keep `auth.users` migration separate from `profiles`. Authorization data must be written to Supabase `app_metadata`, not `user_metadata`.

## 4. Reconcile

Run `reconciliation-counts.sql` on the legacy source and on Supabase, then diff the outputs. Add domain-specific checks for high-risk data:

- Order totals versus item totals.
- Wallet balances versus wallet transactions.
- Payment splits versus gateway transactions.
- Active `user_roles` per restaurant.
- Orphan checks on `restaurant_id`, `user_id`, `order_id` and payment foreign keys.

## 5. Dry Run And Cutover

Dry run in staging with a realistic copy:

1. Freeze writes in the source.
2. Run final delta load.
3. Execute reconciliation.
4. Point backend `DATABASE_*` to Supabase staging.
5. Smoke test login, order creation, order status changes, payments, wallets and admin views.
6. Record elapsed time for the production maintenance window.

Production cutover uses the same sequence. Rollback is DNS/config reversal plus restoring writes to the legacy database from the pre-cutover snapshot.

## Mobile app: cutover 100% Supabase

The React Native apps use Supabase Auth (session + refresh), PostgREST for `orders` / `reservations` (and related rows), and Supabase Realtime for `orders`, `reservations`, `notifications`, and `waitlist_entries`. They no longer use feature flags such as `EXPO_PUBLIC_USE_SUPABASE_*`; the publishable key and `EXPO_PUBLIC_SUPABASE_URL` are required at build time.

Operational REST on the Nest backend (menu, staff, KDS HTTP, cash register, etc.) may still be used where not yet backed by Supabase. Removing legacy `/auth/*` and Socket.IO gateways from the backend is optional until no other client depends on them.

## Security Gates

- RLS is enabled for all exposed `public` tables.
- Policies use `to authenticated` or `to anon` explicitly.
- Policies wrap JWT helper calls with `select` where practical for performance.
- No frontend receives service role keys.
- Views exposed to clients use `security_invoker = true` or are removed from exposed schemas.
- Security-definer functions live in private schemas only.
