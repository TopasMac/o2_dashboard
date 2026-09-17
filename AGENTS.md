# Codex working rules

These rules apply to every Codex task in this repository. Read `PROJECT_STATUS.md`, `LOCAL_DEVELOPMENT.md`, and the relevant section of `FEATURE_INVENTORY.md` before making material changes.

## Project objective

Improve and simplify the existing Owners2 platform incrementally. Preserve working operational behavior, historical data, and external integrations while removing obsolete features only after their usage has been verified.

Do not propose a ground-up rewrite as the default approach. Prefer small, testable changes in the current application.

## Workspace roles

- This Git repository is the source of truth for application code and versioned project documentation.
- `/Users/topas/Library/CloudStorage/OneDrive-Owners2/4.CODEX/HausIn_Portal` is secondary storage for plans, reports, screenshots, exports, and other supporting material that should not live in Git.
- Never place source code required to build or deploy the application only in OneDrive.

## Safety boundaries

- Treat production as read-only unless the user explicitly authorizes a precisely described production action.
- Never deploy, push, merge, change production cron jobs, run production migrations, send real email, or mutate production data without explicit authorization for that action.
- Never point local `DATABASE_URL` at production. Use the local `owners2_dev` database.
- Never commit secrets, `.env`, `.env.local`, JWT keys, database dumps, customer exports, or production credentials.
- Keep local mail routed to Mailpit.
- Preserve the development safeguards that disable UnitMedia S3 mutation listeners. Other S3-writing paths must be assessed before they are exercised.
- Do not run `doctrine:schema:update --force`.
- Before any destructive database operation, require an explicit target, a current backup, a reviewed migration, and a rollback plan.
- Do not edit production cron schedules until the current commands, logs, external caller, and replay path have been verified.

## Protected behavior

Treat these areas as high risk and add or extend tests before changing them:

- Airbnb email ingestion, parsing, deduplication, and booking creation
- Airbnb iCalendar synchronization and reconciliation
- Booking dates, night calculations, status transitions, holds, and month slices
- Housekeeping side effects and financial calculations
- Authentication, authorization, public report links, email, and S3 storage
- Database migrations and entity relationship mappings

Use synthetic or saved sanitized inputs for local integration tests. Local testing must not invoke Power Automate, Airbnb, real mailboxes, live calendars, or production callbacks unless the user explicitly requests and authorizes that test.

## Working method

1. Start from an up-to-date `develop` branch and use a short-lived, purpose-specific branch.
2. Inspect the relevant frontend, backend, database, scheduled-job, and external-integration paths before editing.
3. Keep changes focused. Do not mix cleanup, schema repair, and feature behavior in one change.
4. Preserve unrelated user changes and call out unexpected repository state before proceeding.
5. Add proportionate automated tests, then run focused checks followed by broader checks when warranted.
6. Report what changed, what was verified, known limitations, and any manual checks still needed.
7. Do not commit, push, open or merge a pull request, or deploy unless the user explicitly asks for that step.

## Database changes

- Add a focused Doctrine migration for every intended schema change.
- Review generated SQL; never assume merging code automatically creates a production table.
- Test migrations against a disposable local database or approved local snapshot.
- The historical migration chain is known to be unreliable from an empty database. Do not repair or rewrite historical migrations as part of unrelated work.
- Never use schema synchronization as a production deployment mechanism.
- Preserve historical tables and columns until application references, scheduled writers, reports, and actual data activity have been checked.

## Release process

The intended promotion path is:

```text
feature/fix branch -> pull request into develop -> local/staging verification
-> pull request from develop into main -> explicit manual production deployment
```

`develop` is the permanent integration branch. Do not delete it after a pull request is merged.

Merging into `main` is not itself a deployment. The current deployment script pulls `main`, installs dependencies, runs migrations, builds the frontend, and restarts Nginx. Review the change set, migration SQL, backup status, and rollback plan before invoking it.

Before every production deployment:

1. Run `git status --short --branch` and record the current production commit.
2. If the checkout is dirty, stop. Inventory and review the changes before pulling or deploying.
3. Create a patch and a direct archive of all modified and untracked files before using a stash.
4. Reconcile any intended production-only behavior into a tested Git branch and merge it normally.
5. Confirm a current database backup, the exact target commit, and a rollback plan.
6. Obtain explicit deployment authorization, then run smoke checks and retain the safety stash until verification is complete.

Never discard, reset, overwrite, or reapply a production stash without reviewing its relationship to the deployed revision.

## Communication

- Lead with the outcome and explain technical decisions in plain language.
- Ask only when a missing decision materially affects behavior or safety; otherwise inspect and proceed within scope.
- Never describe an uncertain production fact as confirmed. Record assumptions and how they can be verified.
- Keep `PROJECT_STATUS.md` concise and update it when architecture, risks, priorities, or the release process materially changes.
- Update `FEATURE_INVENTORY.md` when a feature is confirmed as kept, retired, or materially redesigned.
