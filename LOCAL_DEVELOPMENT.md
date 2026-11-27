# Owners2 local development

This setup runs the application on a Mac while keeping the production server and database isolated. MySQL and Mailpit run in Docker; PHP and Node run on the Mac.

## Requirements

- PHP 8.2 or newer and Composer 2
- Docker Desktop
- nvm with the Node version from `.nvmrc`

## Initial setup

1. Create ignored local environment files:

   ```bash
   cp .env.example .env
   cp .env.local.example .env.local
   ```

   Replace every `replace-with-...` value in `.env.local`. Keep the database password identical in `OWNERS2_DB_PASSWORD` and `DATABASE_URL`. Use URL-safe characters in that password.

2. Start the local infrastructure:

   ```bash
   docker compose --env-file .env.local -f compose.dev.yaml up -d
   docker compose --env-file .env.local -f compose.dev.yaml ps
   ```

   MySQL listens only on `127.0.0.1:3308`. Mailpit listens on `127.0.0.1:1025`, with its web interface at <http://127.0.0.1:8025>.

3. Install backend dependencies and generate local JWT keys:

   ```bash
   composer install --no-scripts
   php -d memory_limit=512M bin/console cache:clear
   php bin/console lexik:jwt:generate-keypair
   ```

4. Install frontend dependencies:

   ```bash
   . "$HOME/.nvm/nvm.sh"
   nvm use
   npm --prefix frontend ci
   ```

## Local database

The preferred development database is an approved snapshot restored into `owners2_dev`. Never point `DATABASE_URL` at the production database.

After restoring a snapshot, add or refresh the local-only administrator without purging imported data:

```bash
php bin/console doctrine:fixtures:load --append --no-interaction
```

Local administrator login:

- Email: `admin@owners2.local`
- Password: `Owners2Local!2026`

Local Cleaner login:

- Email: `cleaner@owners2.local`
- Password: `Owners2Local!2026`
- Mobile access: Cleanings only
- City scope: Playa del Carmen

The fixture refuses to run when `APP_ENV=prod`.

For an empty disposable database, create the current mapped schema and baseline the historical migrations:

```bash
php bin/console doctrine:database:create --if-not-exists
php -d memory_limit=512M bin/console doctrine:schema:create
php bin/console doctrine:migrations:sync-metadata-storage
php bin/console doctrine:migrations:version --add --all --no-interaction
php bin/console doctrine:fixtures:load --no-interaction
```

The historical migration chain cannot currently build the schema from zero. Do not repair or squash it as part of unrelated feature work.

## Run the application

Backend terminal:

```bash
PHP_CLI_SERVER_WORKERS=4 php -d memory_limit=512M -d display_errors=0 -S 127.0.0.1:8001 -t public public/router.php
```

The HOA Report Preview makes a second request to the backend while generating the PDF. Multiple PHP workers let it serve both requests. PHP diagnostics go to the server log so they don't corrupt binary responses. Install wkhtmltopdf for PDF previews and set `WKHTMLTOPDF_BINARY` in `.env.local` if the binary is outside `/usr/local/bin/wkhtmltopdf`. For the logo in local PDFs, copy `frontend/public/img/company-logo.png` to `public/img/company-logo.png`.

Frontend terminal:

```bash
cd frontend
. "$HOME/.nvm/nvm.sh"
nvm use
O2_API_TARGET=http://127.0.0.1:8001 BROWSER=none npm start
```

Open <http://localhost:3000>.

## Safety rules

- Local outgoing email goes to Mailpit.
- Development service configuration disables the S3 media update and delete listeners.
- No production cron jobs run on the Mac.
- Do not run integration commands that read external mailboxes or calendars unless that test is intentional.
- Do not run `doctrine:schema:update --force`. The production-derived schema has known drift, and the generated SQL includes destructive unrelated changes.
- Never commit `.env`, `.env.local`, JWT private keys, database dumps, or production credentials.

## Git workflow

Use short-lived feature branches and promote changes in this order:

```text
feature branch -> develop -> main -> explicit production deployment
```

Merging into `main` does not deploy automatically. Database changes require a focused, reviewed Doctrine migration and a production backup before deployment.

The production deployment script builds the React application in `frontend/build/` and then publishes that build into Symfony's `public/` directory without deleting backend entry points or uploaded files. Generated frontend files in `public/` are ignored by Git; Symfony's `public/index.php`, `public/router.php`, and `public/.htaccess` remain versioned. The separate mobile S3 upload and CloudFront invalidation are still required after releases that change the frontend. The `deploy.sh` completion message covers the server deployment only. See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete production procedure.

## Stop local services

```bash
docker compose --env-file .env.local -f compose.dev.yaml down
```

This preserves the MySQL Docker volume. Add `--volumes` only when intentionally deleting the disposable local database.

## Occasionally replace the local Docker database

The repository script `scripts/refresh_local_database.py` replaces **only** the
existing `owners2_dev` database in `owners2-mysql-dev` on `127.0.0.1:3308`.
It discards local testing data without creating a recovery backup. This is the
local-only exception documented in `AGENTS.md`; production rules remain in force.

1. Copy a trusted, complete plain SQL backup into:
   `/Users/topas/Library/CloudStorage/OneDrive-Owners2/4.CODEX/HausIn_Portal/Database_Refresh/incoming/`.
   Keep backups outside Git. Select an exact file; nothing watches this folder
   and the script never automatically selects the newest backup.
2. Stop the local frontend, backend, and any other database writers. Keep the
   Docker database running. Verify your ignored local environment still uses
   `APP_ENV=dev`, `127.0.0.1:3308/owners2_dev`, and
   `MAILER_DSN=smtp://127.0.0.1:1025`. Preserve the development S3 safeguards.
3. From this repository, validate the file and live Docker target without writes:

   ```bash
   python3 scripts/refresh_local_database.py \
     "/Users/topas/Library/CloudStorage/OneDrive-Owners2/4.CODEX/HausIn_Portal/Database_Refresh/incoming/owners2_dashboard_2026-11-26-02-30.sql" --check
   ```

4. Run the same command without `--check`. Review the displayed file and target,
   then type `replace owners2_dev` to authorize deletion and import.
5. Inspect local migration status with
   `php bin/console doctrine:migrations:status`. Review pending migration SQL
   separately before deciding to apply it. The script runs no migrations or
   fixtures. Existing backup accounts remain available for local login.
6. Restart the application using the commands above and check login, Bookings,
   and Housekeeping. If an import fails after deletion, the database can be
   incomplete: leave the application stopped, resolve the error and repeat the
   import from the same complete backup.

The command requires Python 3 and Docker. It verifies the pinned MySQL image,
loopback port, named development volume, Compose service, and database name.
After confirmation, a temporary import account receives privileges only on
`owners2_dev` and is removed afterward. Root creates/removes that account and
runs the fixed database drop/create statements. Production view `DEFINER`
clauses are changed in memory to `CURRENT_USER` with `SQL SECURITY INVOKER`
for local compatibility (views execute with the caller’s permissions); the
backup file is unchanged. Dumps selecting/creating databases, routines,
triggers, events, or file operations are rejected. This is a trusted-backup
workflow, not a sandbox for arbitrary SQL. Container credentials are read inside
Docker and never printed. SQL error output is suppressed because it can include
customer data; investigate failures locally without publishing raw diagnostics.

The Docker database is shared across worktrees using this container. Coordinate
with other local sessions before replacing it. Copying a backup does not import
it, and no old local database copy is retained.

### Requests handled by future Codex chats

When the owner asks **“Refresh the local database using [filename] in incoming,
then restart local”**, treat that as authorization to replace disposable local
`owners2_dev` from that exact backup, discard existing testing data without a
backup, and restart both local servers. Follow this sequence:

1. Resolve the exact filename inside
   `/Users/topas/Library/CloudStorage/OneDrive-Owners2/4.CODEX/HausIn_Portal/Database_Refresh/incoming/`.
   Do not select another file automatically. If it is missing, ask for the correct
   filename. Keep SQL backups and credentials outside Git.
2. Inspect ports 3000 and 8001 and identify each process and its working directory.
   Stop only servers belonging to the current worktree. If another worktree or
   application owns either port, report the conflict and ask how to proceed.
   Coordinate other database writers because the Docker database is shared.
3. Check this worktree's dependencies, local JWT keys, ignored environment files,
   Docker MySQL, and Mailpit using this guide. A new worktree may lack `vendor`,
   `frontend/node_modules`, `.env`, `.env.local`, or JWT keys. Reuse verified local
   configuration when appropriate; never copy production configuration. Preserve
   existing files and secrets. Before any Symfony command, verify the effective
   environment is `dev`, DATABASE_URL targets `127.0.0.1:3308/owners2_dev`, mail
   routes to Mailpit, and development S3 safeguards remain active. Older local
   configurations may target `owners2_dev_20261105`: explicitly correct the local
   database name to `owners2_dev` for this workflow, without changing credentials.
   Do not print environment files or connection strings containing passwords.
4. Run `python3 scripts/refresh_local_database.py "<exact backup path>" --check`.
   If it passes and the local writers are stopped, run without `--check`. The
   owner's explicit refresh request authorizes entering `replace owners2_dev`
   at the script prompt; no additional chat confirmation is needed.
5. On failure, leave the application stopped and report it. Do not automatically
   retry a destructive import. On success, run
   `php bin/console doctrine:migrations:status` against `owners2_dev`. If migrations
   are pending or unavailable, report them and obtain a separate decision before
   applying migrations or restarting against an incompatible schema. Never use
   schema synchronization to resolve a mismatch.
6. With compatible schema, start both servers from this worktree using the pinned
   Node version, frontend port 3000, backend `127.0.0.1:8001`, and
   `O2_API_TARGET=http://127.0.0.1:8001`. Keep persistent sessions, verify both
   respond and the frontend API proxy reaches Symfony, and report both URLs.
   Do not run fixtures or create local accounts unless separately requested.

This request authorizes only the local refresh and restart. It does not authorize
production access, external integration tests, commits, pushes, PRs, or deployment.
