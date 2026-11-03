# iON CCTV demo

**App URL:** https://ravikants2.github.io/tempcctv/

The public GitHub Pages app talks to a Cloudflare Worker API. The Worker reads and writes `Ravikants2/ion-cctv-private-data` (`data` branch, `db.json`) using a repo-scoped GitHub token held as a Cloudflare Worker secret. App users sign in with their existing email and password; users do not need a GitHub account or token.

## Existing accounts and first Super Admin

The Worker migration preserves existing user IDs and valid PBKDF2 password hashes. If legacy records contain plaintext passwords, the Worker replaces them with PBKDF2 hashes before saving and never returns hashes to the browser. The existing Super Admin can then create accounts and reset passwords from **User Management**.

If the private database does not contain a Super Admin with a PBKDF2 password hash, configure both `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` as repository Actions secrets. On the first API request, the Worker creates or upgrades the account matching that email; an existing matching account keeps its ID. Use a password with at least 12 characters. These bootstrap secrets are optional once the database already has a valid Super Admin.

## Configure deployment

The GitHub Actions workflows publish the Worker and GitHub Pages app. Before deploying, configure the following in the public app repository under **Settings → Secrets and variables → Actions**. Never put secret values in source, workflow files, chat messages, or the private data database.

### Repository secrets

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with permission to deploy Workers for the target account.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `DATA_PAT` — a fine-grained GitHub token scoped only to `ion-cctv-private-data`, with **Contents: Read and write** permission. The deployment workflow installs it as the Worker secret `DATA_PAT`.
- `SESSION_SECRET` — a unique random signing secret of at least 32 characters. Keep it private; rotating it signs out all users.
- `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` — optional, but set both if a valid Super Admin account is not already in `db.json`.

The Worker uses the repository owner, name, branch, and app origin configured in [worker/wrangler.toml](./worker/wrangler.toml). Observability is disabled in this configuration. Login requests are rate-limited to 10 attempts per minute per IP; Cloudflare rate limits are approximate and local to each Cloudflare location.

### Repository variable

After the first successful Worker deployment, copy its `workers.dev` URL from Cloudflare and add it as the repository Actions variable `VITE_API_ENDPOINT`. Then run the Pages workflow again (or push another change). This value is public configuration, not a secret. The Pages workflow fails rather than publishing an app without an API endpoint.

## Access and prototype limitations

The browser stores only an eight-hour signed app session in session storage. The Worker keeps the GitHub data token server-side and authenticates app-user API requests. Super Admin-only endpoints protect account and access-role management. However, the prototype does not enforce every feature permission or zone restriction in the API: any signed-in app user can access the full operational dataset. Repository collaborators and Cloudflare administrators can also access the private database or its password hashes, which can be attacked offline. Use unique strong passwords and do not store confidential, personal, or regulated information in this demo.

The private data repository must remain private. The former public `data` branch was removed after application data had been publicly accessible. Deleting a branch cannot remove copies, forks, clones, or all historical objects. Treat any information previously stored there as exposed and rotate credentials that may have been present.

Cloudflare Worker Observability and the Gemini integration are not enabled. AI chat is not available in this demo.

## Run locally

```sh
npm ci
$env:VITE_API_ENDPOINT = "https://<worker-name>.<account-subdomain>.workers.dev"
npm run dev
```

## Features

- Executive, financial, operations, vendor, and venue dashboards
- Requirements and vendor management, including CSV/XLSX imports
- Installation records with searchable TC-code selection, requirement-sourced exam schedules, quote history, and approval flows
- Bulk installation templates with duplicate schedule cleanup and two storage slots with quantity and market-size dropdowns
- App user accounts, passwords, roles, and groups stored in the private data repo
- Excel/PDF export and JSON backup/restore
- Authenticated API access through the Cloudflare Worker
