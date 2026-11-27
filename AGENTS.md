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
- Local refresh exception: the documented `scripts/refresh_local_database.py` procedure may replace disposable Docker `owners2_dev` from an explicitly selected trusted SQL backup after typed confirmation, without backing up existing testing data or requiring a migration. Recovery is reimporting the selected backup. This exception does not authorize production operations or other destructive database changes.
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

1. Start from an up-to-date `main` branch and use a short-lived, purpose-specific branch.
2. Inspect the relevant frontend, backend, database, scheduled-job, and external-integration paths before editing.
3. Keep changes focused. Do not mix cleanup, schema repair, and feature behavior in one change.
4. Preserve unrelated user changes and call out unexpected repository state before proceeding.
5. Add proportionate automated tests, then run focused checks followed by broader checks when warranted.
6. Report what changed, what was verified, known limitations, and any manual checks still needed.
7. Do not commit, push, open or merge a pull request, or deploy unless the user explicitly asks for that step.

## UI design standards

Before changing UI, read `docs/ui/IMPLEMENTATION_STATUS.md` and the relevant standards linked from `docs/ui/README.md`. Unit Transactions (`frontend/src/pages/Owners2UnitTransactions.jsx`) is the deployed reference for desktop table pages.

Reuse the approved `theme.hausin` tokens, `TableToolbar`, opt-in `PageScaffold`/`TableLite` behavior, and pagination components for comparable pages. Migrate pages incrementally in focused PRs from current `main`, preserving each page's operational behavior and verifying shared consumers. Existing pages adopt the new presentation when explicitly included in the task.

Table-page patterns are approved. General form layouts and other patterns still require design and approval before being treated as project standards. Record new decisions and converted pages in the UI documentation so future chats can continue the rollout.

## Starting local servers

When the user asks to start local, start the local server, or run the app, start both the React frontend and Symfony backend using the commands in `LOCAL_DEVELOPMENT.md`. A request specifying port 3000 still includes the backend unless the user explicitly requests only one component.

- Run both servers from this worktree, using the Node version pinned in `.nvmrc` and the existing local environment configuration.
- Serve the frontend at `http://localhost:3000` and the backend at `http://127.0.0.1:8001`. Set `PORT=3000` and `O2_API_TARGET=http://127.0.0.1:8001` for the frontend.
- Check both ports and identify the owning processes and their working directories before starting. Reuse a healthy server belonging to this worktree. If another worktree or application owns a required port, report the conflict and ask how to proceed. Do not stop that process or silently choose another port.
- Check the required dependencies and local MySQL/Mailpit services using `LOCAL_DEVELOPMENT.md`. Preserve existing environment files, JWT keys, and database contents. Report any missing configuration needed to start safely without exposing secrets.
- Keep both servers running in persistent sessions. Verify that each responds and that the frontend can reach the backend through its API proxy before reporting success.
- Report both URLs and any startup errors or blockers. If the user explicitly requests only the frontend or only the backend, start and verify that component alone.

## Refreshing the local database

For requests such as “Refresh the local database using [filename] in incoming, then restart local”, follow **Requests handled by future Codex chats** in `LOCAL_DEVELOPMENT.md`. That workflow defines the local-only authorization, environment checks, import, migration review, and server restart.

## Starting a feature

Before any edits:

1. Run `git fetch origin --prune` and report the current branch and worktree.
2. If `git log origin/main..HEAD` or `git status --short` is non-empty, stop and tell the user. If HEAD is detached, stop unless this is a linked worktree (not the main checkout) with a clean tree and no commits ahead of `origin/main`; a detached HEAD there is expected (for example, Codex worktrees). Otherwise run `git reset --hard origin/main`.
3. Name the branch `feature/<name>` using the name the user provides. Do not choose the name. In an app-managed worktree, rename the app-created branch with the app's rename tool, never raw `git branch -m`. Outside an app worktree, or from a detached HEAD in a linked worktree, create it with `git switch -c feature/<name> --no-track origin/main`.
4. Verify and report: branch name, `HEAD == origin/main`, clean tree.
5. Never branch from or reuse another feature branch. If the main checkout is on unfinished work, use a separate `git worktree add` from `origin/main`.

## Finishing a feature

Squash-merged branches are not recognized by `git branch -d`; use `git branch -D feature/<name>` only after confirming the PR is merged. Never delete `main`. Remove any worktree first (`git worktree remove <path>`), then delete the branch. GitHub deletes the remote branch on merge; confirm with `git fetch --prune`.

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
feature/fix branch -> pull request into main (squash merge) -> local verification
-> explicit manual production deployment
```

`main` is the only long-lived branch. Protect it on GitHub (require a pull request).

Merging into `main` is not itself a deployment. The current deployment script pulls `main`, installs dependencies, runs migrations, builds the frontend, and restarts Nginx. Review the change set, migration SQL, backup status, and rollback plan before invoking it.

**Read `DEPLOYMENT.md` before any deployment work.** It is the single authoritative procedure, including the separate mobile S3 publishing and CloudFront invalidation that `deploy.sh` does not perform. The `deploy.sh` completion message covers the server deployment only.

Before every production deployment:

1. Run `git status --short --branch` and record the current production commit.
2. If the checkout is dirty, stop. Inventory and review the changes before pulling or deploying.
3. Create a patch and a direct archive of all modified and untracked files before using a stash.
4. Reconcile any intended production-only behavior into a tested Git branch and merge it normally.
5. Confirm a current database backup, the exact target commit, and a rollback plan.
6. Obtain explicit deployment authorization, then run smoke checks and retain the safety stash until verification is complete.

If a manual backup uses `umask 077`, run it in a subshell or restore `umask 022` before deployment. Leaving the restrictive umask active can make newly checked-out application files unreadable by PHP-FPM or Nginx.

Never discard, reset, overwrite, or reapply a production stash without reviewing its relationship to the deployed revision.

## Communication

- Lead with the outcome and explain technical decisions in plain language.
- Ask only when a missing decision materially affects behavior or safety; otherwise inspect and proceed within scope.
- Never describe an uncertain production fact as confirmed. Record assumptions and how they can be verified.
- Keep `PROJECT_STATUS.md` concise and update it when architecture, risks, priorities, or the release process materially changes.
- Update `FEATURE_INVENTORY.md` when a feature is confirmed as kept, retired, or materially redesigned.
