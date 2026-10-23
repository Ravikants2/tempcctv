# iON Surveillance Temporary Infrastructure (CCTV)

**New app URL:** https://ravikants2.github.io/tempcctv/

This is a separate repository and deployment. The existing `Ravikants2/ion-cctv-app` repository is not used as the deployment target and is not modified by these instructions.

## Deployment and secure data setup

The public GitHub Pages site contains only the frontend. Sign-in, account management, audit logging, and application data access run through a Cloudflare Worker. The application database is stored in the private `Ravikants2/ion-cctv-private-data` repository; the public app repository must never receive a data-repository token. This deployment uses the same private database as configured in the Worker settings.

### 1. Configure GitHub Actions secrets

In `tempcctv`, open **Settings → Secrets and variables → Actions → Secrets** and add:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with permission to deploy Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account that owns the Worker |
| `DATA_PAT` | Fine-grained GitHub token restricted to `ion-cctv-private-data`, with Contents read/write access |
| `SESSION_SECRET` | Random secret of at least 32 characters used to sign sessions |
| `BOOTSTRAP_ADMIN_EMAIL` | Email address for the initial Super Admin |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial Super Admin password (at least 12 characters) |
| `GEMINI_API_KEY` | Optional; required only to enable AI chat |

Never put these credentials in source files, browser environment variables, issues, or chat. `DATA_PAT` is uploaded only to the Worker by its deployment workflow; the Pages build does not receive it.

The Worker reads and writes `db.json` on the private repository's `data` branch. Each save is a Git commit there. Users' passwords are stored as salted PBKDF2 hashes, session tokens expire after eight hours, and server-generated audit records track sign-ins, sign-outs, exports, and application changes. No application data is cached for offline use.

### 2. Configure Pages and Worker settings

1. In the new repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, set `VITE_API_ENDPOINT` to `https://ion-cctv-tempcctv.<account>.workers.dev` and `VITE_GEMINI_CHAT_ENDPOINT` to `https://ion-cctv-tempcctv.<account>.workers.dev/api/chat`. Replace `<account>` with your Cloudflare Workers account subdomain.
3. Ensure the private data repository exists and contains the migrated `db.json` on its `data` branch.
4. Push the code to the `main` branch. The Worker workflow deploys the API, then the Pages workflow builds and publishes the frontend. Watch both under the new repository's **Actions** tab.
5. Sign in using the bootstrap admin credentials. Reset passwords for existing accounts from User Management; old client-side password credentials are not used by the secure login.

For local development, put `VITE_API_ENDPOINT` and `VITE_GEMINI_CHAT_ENDPOINT` in an ignored `.env.local` file. Add `http://localhost:5173` to the Worker `ALLOWED_ORIGINS` setting when using the local Vite server; retain the production origin as well.

### Security notice

The former public `data` branch was removed after the database had been publicly accessible. Treat information previously stored there as exposed: deleting a branch cannot remove copies, forks, clones, or all historical objects. Rotate any credentials that may have been present and review the private database before production use.

---

## Features

- 5 Dashboards: Executive, Financial, Operations, Vendor, Venue
- Sortable table headings and 10-row pagination across data tables
- Excel/PDF export controls on app pages
- Requirement Master upload (CSV/XLSX template)
- Zone-wise Vendor Master upload/download with round-trippable `Zone-12345` Vendor IDs
- Venue analysis with multi-select temporary CCTV day filters, camera counts, hover details, top-cost rankings, and zone comparisons
- Case-insensitive vendor and zone matching for vendor setup and imports
- Super Admin user management: create/delete users, change roles, reset passwords, and review sign-in/change activity
- Installation Record (single entry + bulk upload)
- Exam date-wise candidate tracking
- Quotation PDF upload and view
- Two-stage quote approvals (Surveillance Head → Head of Enablement), with send-back, mandatory exception remarks, and immutable quote revision history
- Approval comparisons for previous venue costs and quotations, vendor reuse across locations, and project-level total/per-candidate cost rankings
- Zonal user accounts restricted to their assigned zone across Requirements, Records, and Vendors; returned quotes require a resubmission note
- Configurable custom access roles and groups: Super Admins choose page/action permissions and zone scopes; group and role scopes are intersected, and users with no assigned zones see no venue data
- Numeric-only, free-written TC Codes and TC Code filters on the dashboard, requirements, records, and approval queue
- Approval review hierarchy by client and exam, with selectable TC venues, select-all and bulk approval, and per-venue discrepancy remarks
- Venue-wide temporary CCTV day, candidate, accumulated cost, and cost-per-candidate totals; exam/date-level schedule details and venue/vendor cost and approval-history drill-downs
- Clickable, blinking higher-cost alerts that explain the comparison behind each approval warning
- Existing installation records without approval metadata are migrated to pending Surveillance Head review; records with explicit final approval remain approved
- Excel export + PDF/Print reports (A4 landscape)
- Role-based access: Super Admin / Sub Admin / User / Viewer / Zonal User / Surveillance Head / Head of Enablement / configured custom roles
- Backup & Restore (JSON download/upload from header menu)
- Application data synced through the Worker to the private GitHub data repository
- Gemini-powered chat over structured application records

The Worker enforces authentication for data access, account administration, and chat. Fine-grained page permissions and zone scopes are still applied in the client application and are not server-side access boundaries. Do not rely on those scopes to isolate sensitive data between users.

## Gemini data chat

The **AI Chat** page sends the current requirements, vendors, joined installation/exam records, and chat messages to Gemini through the authenticated Cloudflare Worker. It excludes user accounts/password hashes, audit logs, and quotation file contents. Chat history is kept only in the current browser tab and is not saved. Operational context is sent to Google Gemini for processing; do not use the feature for data that must not be shared with that service.

The Gemini key must stay in the Worker and must never be added to the frontend, a `VITE_*` variable, or this repository.

The Worker uses `gemini-3.1-flash-lite` by default and retries a request with `gemini-3.8-flash` if the first model returns HTTP 404 (unavailable model) or 429 (rate limit/quota). These defaults can be changed with the `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` variables in `worker/wrangler.toml`. A different model may have separate model-specific limits, but no model is guaranteed to have unlimited quota; check the active project limits in Google AI Studio.

The Worker allows only configured browser origins, requires a signed-in session, limits request size, and forwards the Gemini key only in a server-to-server request. Configure `ALLOWED_ORIGINS` in `worker/wrangler.toml` to match the exact site origins. For model selection and quota behavior, see `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` in that file.
