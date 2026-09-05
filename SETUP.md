# Bogt Portal — Local Setup

This is the full source for the Amazon Inventory + Purchasing + Reorder + Supplier +
Invoice Intelligence system: Next.js 16 (App Router) + Prisma + PostgreSQL.

## Requirements

- Node.js 20+
- PostgreSQL 16 (an earlier v14/v15 will likely also work)
- npm

## 1. Install dependencies

```bash
npm install
```

## 2. Create the database

```bash
createdb bogt_portal
# or, if you need a role first:
# createuser -s postgres
```

## 3. Configure environment

Copy `.env.example` to `.env` and fill in a real `DATABASE_URL` and `AUTH_SECRET`:

```bash
cp .env.example .env
```

`AUTH_SECRET` just needs to be a long random string, e.g. `openssl rand -hex 32`.
`GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` can stay empty — the Google Sheets sync
feature degrades cleanly to "Connection Required" without it; everything else
works fully without it (manual CSV/XLSX upload uses the identical import
pipeline).

## 4. Load the data — two options

**Option A — restore the exact demo data** (243 products, suppliers, purchase
history, alerts, etc. — this is the exact database this build was verified
against):

```bash
pg_restore -d bogt_portal --no-owner --no-privileges bogt_portal.dump
npx prisma generate
```

**Option B — generate fresh sample data from scratch:**

```bash
npx prisma generate
npm run db:push      # creates all tables from the schema
npm run db:seed      # populates realistic sample data
```

## 5. Run it

```bash
npm run build
npm run start -- -p 3000
```

Open http://localhost:3000 — you'll land on `/login`.

## Login

| Email | Password | Role |
|---|---|---|
| admin@bogt.local | ChangeMe123! | Admin (full access to every page) |

(Other seeded users exist with restricted roles — see `prisma/seed.ts` for
the full list if you want to test RBAC.)

## Verifying it's working

```bash
npm run test   # runs the vitest suite — should be 88/88 passing
```

## Project structure

- `app/` — Next.js App Router pages + Server Actions (`app/actions/`)
- `lib/` — calculation engines (profitability, supplier selection, invoice
  classification, alerts), import pipeline, matching engine, auth/RBAC
- `prisma/schema.prisma` — full data model
- `prisma/seed.ts` — sample-data generator
- `tests/` — unit + integration tests (vitest)

## Notes

- Every screen reads/writes the real Postgres database — there is no mocked
  data anywhere in the running app.
- The Google Sheets sync feature requires a real Google service account JSON
  to actually connect; without it, the Import & Sync page correctly shows
  "Connection Required" rather than fabricating a sync.
- The Reports page covers the full spec section-36 catalog (25 reports across
  Inventory, Sales & Stock Status, Profitability, and Supplier & Purchasing),
  each loaded on demand and exportable to CSV.
- Invoice upload currently supports CSV/XLSX only (no PDF extraction).
