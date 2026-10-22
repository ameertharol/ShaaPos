# Northstar Retail POS

A responsive retail POS starter with a MySQL database, a serverless Node.js API, and a Vercel-ready static frontend.

## Included

- Dashboard with current-day sales, order count, gross profit, inventory value, recent transactions, and reorder alerts.
- Responsive sidebar navigation for every requested page.
- MySQL-backed product, customer/supplier, account, document, and settings records.
- Purchase, purchase return, sale, and sales return entries that update stock in a transaction.
- Receipts, payments, journal entries, date filters, search, purchase and sales reports, and account statement activity.
- Administrator password login with signed, HttpOnly sessions.

This is a single-store starter, not a finished accounting or tax-compliance system. It does not include barcode hardware, payment-gateway processing, multi-user roles, audit trails, tax configuration, or backup tooling. Configure and validate those requirements before using it for live operations.

## MySQL setup

1. Create a MySQL 8 database and a dedicated database user with access only to that database.
2. Run [`database/schema.sql`](database/schema.sql) in the database. It creates the tables and a small default chart of accounts.
3. Copy `.env.example` to `.env` for local use and set:
   - `DATABASE_URL` — MySQL connection URL (`mysql://user:password@host:3306/database`). URL-encode special characters in the username/password.
   - `POS_ADMIN_PASSWORD` — a long unique administrator password.
   - `SESSION_SECRET` — a random secret of at least 32 bytes. Generate one with `openssl rand -base64 48`.

Never commit `.env` or put database credentials in frontend code. The `.gitignore` excludes local environment files.

## Run locally

Install Node.js 20 or later. Install dependencies with `npm install`. To emulate Vercel's API routes locally, install the Vercel CLI and run `vercel dev` from this folder. Then open the local URL printed by the CLI. The app needs a reachable MySQL instance and all three environment variables to sign in and load data.

## GitHub and Vercel deployment

1. Create a **private** GitHub repository and push this project to it.
2. Import that repository in Vercel and set the project root to this directory.
3. In Vercel Project Settings → Environment Variables, configure `DATABASE_URL`, `POS_ADMIN_PASSWORD`, and `SESSION_SECRET` for the Production environment (and Preview only if you intend to use preview deployments with non-production database credentials).
4. Deploy, open the generated URL, and sign in with the configured administrator password.
5. Keep the MySQL server reachable from Vercel Functions; use a managed MySQL host with TLS and database backups.

Vercel deploys repository changes automatically after a Git repository is connected. Environment variable changes require a new deployment. See [Vercel Git deployments](https://vercel.com/docs/git) and [Vercel environment variables](https://vercel.com/docs/environment-variables).
