# iON CCTV GitHub-backed demo

**App URL:** https://ravikants2.github.io/tempcctv/

The public GitHub Pages site uses the private `Ravikants2/ion-cctv-private-data` repository (`data` branch, `db.json`) for application data and app user accounts. The browser calls the GitHub API directly. There is no Cloudflare Worker or other application server.

## Sign in

Each operator needs:

1. An existing app user ID (email) and password from the private database.
2. Their own GitHub fine-grained personal access token, scoped only to `ion-cctv-private-data` with **Contents: Read and write** permission.
3. GitHub account access to the private data repository. An organization may need to approve the token.

The app reuses user accounts stored in `db.json`. If there is no Super Admin with a saved password, the first person who signs in with a repository token and a password of at least 12 characters creates the initial Super Admin. Existing accounts and IDs are kept. The **Recover Super Admin** option can create or reset an admin when authorized repository access is available. Super Admins can add users and reset their passwords from **User Management**.

Never put a GitHub token or password in source code, a public repository, a backup, or a chat message. The GitHub token is kept in the current browser tab's session storage and removed when signing out. Revoke it in GitHub if it is exposed.

## Important access limitations

This is a demo architecture, not secure multi-user authorization. Everyone who can use a token with write access to the private data repository can read and modify the entire database and its password hashes through GitHub, regardless of their app role. App roles and zones only restrict the user interface; they do not enforce permissions on the repository or GitHub API. Password hashes use PBKDF2, but anyone with the private database can attempt offline password guesses. Use unique, strong passwords and do not store confidential, personal, or regulated information here.

Writes are saved as GitHub commits. GitHub API availability, rate limits, repository policy, and concurrent edits can affect sign-in and saves. If another user saves first, reload the latest data and reapply the change. There is no offline queue or server-side transaction.

The app does not connect to Cloudflare or Gemini. AI chat is not available in this demo.

The former public `data` branch was removed after application data had been publicly accessible. Deleting a branch cannot remove copies, forks, clones, or all historical objects. Treat any information previously stored there as exposed and rotate credentials that may have been present.

## Run locally

```sh
npm ci
npm run dev
```

The local Vite server prints its URL, usually `http://localhost:5173/tempcctv/`.

## Deploy

The `main` branch deploys the static site to GitHub Pages through `.github/workflows/deploy.yml`. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The build workflow needs no deployment secrets. App users still need their own GitHub tokens at sign-in.

## Features

- Executive, financial, operations, vendor, and venue dashboards
- Requirements and vendor management, including CSV/XLSX imports
- Installation records, exam schedules, quotations, and approval flows
- App user accounts, passwords, roles, and groups stored in the private data repo
- Excel/PDF export and JSON backup/restore
- Direct GitHub API access to the private app database
