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

Local login:

- Email: `admin@owners2.local`
- Password: `Owners2Local!2026`

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
php -d memory_limit=512M -S 127.0.0.1:8001 -t public public/router.php
```

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

## Stop local services

```bash
docker compose --env-file .env.local -f compose.dev.yaml down
```

This preserves the MySQL Docker volume. Add `--volumes` only when intentionally deleting the disposable local database.
