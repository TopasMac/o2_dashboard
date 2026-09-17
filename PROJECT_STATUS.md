# Owners2 project status

Last updated: 2026-09-16

## Objective

Simplify and improve the existing Owners2 property-management platform through incremental, tested changes. Keep operational integrations and historical data intact while confirming which older features can be retired.

## Architecture

- **Backend:** PHP 8.2+, Symfony 7.3, API Platform, Doctrine ORM/DBAL, MySQL, JWT authentication.
- **Frontend:** React 19, React Admin 5, Material UI 7, Axios, Create React App/react-scripts 5.
- **Storage and integrations:** MySQL, AWS S3, email delivery, Airbnb email imports, Airbnb iCalendar feeds, PDF/report generation.
- **Local infrastructure:** MySQL 8.0.43 and Mailpit run through `compose.dev.yaml`; PHP and Node run on the Mac.
- **Repositories and documents:** this Git repository contains build/deploy source; supporting material may be stored in the OneDrive `HausIn_Portal` folder.

See `FEATURE_INVENTORY.md` for the evidence-based feature map and cleanup candidates.

## Critical operational flows

### Airbnb email ingestion

```text
external sender (believed to be Power Automate)
-> authenticated POST /api/airbnb-import
-> airbnb_email_import
-> listener and booking processing services
-> all_bookings
-> month slices and downstream booking workflows
```

The external sender and its authentication are not implemented in this repository. Test changes locally with synthetic or sanitized imports before production rollout.

### Airbnb calendar synchronization

```text
unit Airbnb iCal URLs
-> app:sync-ical
-> ical_events
-> app:reconcile-bookings
-> booking links, placeholders, conflicts, and calendar UI
```

The application also exposes private-reservation iCalendar output for Airbnb. Date boundaries and duplicate behavior are business-critical.

### Booking lifecycle and housekeeping

Bookings feed calendar availability, month slices, reports, holds, housekeeping cleanings, financial calculations, and reconciliation.

Booking synchronization may create or update a checkout cleaning, but it must not mark that cleaning `done`. New and overdue cleanings remain `pending` until an authenticated Cleaner acting as themselves, or an Admin/Manager, explicitly completes them. Cancellation synchronization remains active.

## Completed foundation and safety work

- Added reproducible local development with isolated MySQL and Mailpit.
- Added environment templates, Node pinning, and reproducible frontend installation settings.
- Added guarded development fixtures and disabled UnitMedia S3 mutation listeners in development.
- Corrected invalid Doctrine relationships for `User`/`Employee` and `Unit`/`UnitMedia`.
- Restored an approved production-derived snapshot into local `owners2_dev`.
- Documented the feature inventory, cleanup risks, and staged retirement process.
- Made Airbnb processing and booking calculation/month-slice behavior safer across environments.
- Added booking-night, overlap, status-transition, and housekeeping-completion tests.
- Prevented automatic cleaning completion from booking status changes, edits, or backfills.
- Preserved production booking safeguards for calendar conflicts, back-to-back stays, status refresh, incomplete dates, and Cancun timezone handling.

## Current production release

- **Production checkout:** `/home/ubuntu/owners2_main`
- **Deployed commit:** `2a8fb4b` — `fix: preserve production booking safeguards (#6)`
- **Deployment date:** 2026-09-16
- **Checkout state after deployment:** clean and synchronized with `origin/main`
- **Nginx:** active
- **Doctrine migrations:** 234 executed, 234 available, 0 new; latest `Version20260529050811`
- **Smoke test:** login, Bookings, and Housekeeping/Cleanings verified by the owner.
- **Database backup:** `owners2_dashboard_2026-09-16-02-30.sql` confirmed before deployment.
- **Safety recovery:** production WIP was archived and retained in stash `pre-deploy-production-wip-2026-09-16`; do not reapply it without review because its intended behavior is now reconciled in Git.

The release included no schema migration, cron modification, or historical data correction.

## Verification baseline

- Backend suite: 16 tests, 54 assertions passed for the reconciled release.
- Symfony service-container validation passed in development and production modes.
- Optimized frontend production build passed.
- The legacy frontend `App.test.js` cannot resolve `react-router-dom` in the current Jest setup; this is a known test-harness issue.
- The frontend dependency tree still reports deprecated packages and security advisories; do not run forced production upgrades.

## Local development

Use `LOCAL_DEVELOPMENT.md` as the authoritative setup guide.

- React: `http://localhost:3000`
- Symfony: `http://127.0.0.1:8001`
- MySQL: `127.0.0.1:3308`, database `owners2_dev`
- Mailpit: `http://127.0.0.1:8025`

Use the approved local snapshot. Never connect local code to production. Load local fixtures with `--append` when retaining snapshot data.

## Known risks

- The 234 historical migrations cannot reliably build a clean database from zero.
- The production-derived schema is not fully synchronized with current Doctrine mappings; schema-update SQL may include unrelated destructive changes.
- Production cron commands previously observed do not all match current command names, and booking-status updates appear scheduled twice.
- The external Airbnb email sender's identity, authentication, monitoring, and replay behavior still require confirmation.
- Email-import, iCal, reconciliation, and several financial/report paths still need stronger automated coverage.
- S3 document endpoints and report/email workflows can perform external writes even when UnitMedia listeners are disabled locally.
- Some public report endpoints require a dedicated access-control review.
- Several feature generations and data models overlap; low usage or an empty table is not evidence that removal is safe.

## Current priorities

1. Verify production-critical operations read-only: Airbnb email sender, cron command names/logs, iCal freshness, and duplicate booking-status schedules.
2. Expand tests around Airbnb imports, iCal parsing/reconciliation, holds, and financial/housekeeping side effects.
3. Repair the frontend Jest/router test harness without forced dependency upgrades.
4. Begin low-risk UI cleanup and record owner decisions for features classified **Review** or **Removal candidate**.
5. Consolidate duplicate implementations only after remaining behavior has contract tests.
6. Retire tables and historical data last, with exports, focused migrations, backups, and rollback plans.

## Release process

```text
short-lived branch
-> pull request into develop
-> local/staging verification
-> pull request from develop into main
-> explicit manual production deployment
```

Merging into `main` does not deploy automatically. Before deployment, inspect the production working tree. If it is dirty, stop, archive the changes, reconcile intended behavior into Git, and only then clean the checkout. Confirm the backup, exact target commit, migration plan, rollback plan, and explicit authorization before running `bash deploy.sh`.

After deployment, verify the Git revision, Nginx state, migration status, login, Bookings, and Housekeeping/Cleanings. Retain safety artifacts until the release is confirmed stable.

## Decisions still needed

The owner should mark each as **keep**, **remove**, or **unsure** before cleanup:

- Social Posts and Social Calendar
- Settings placeholder
- Service Providers
- Housekeeping Laundry
- Unit onboarding inventory
- Unit Purchase Lists and Catalog
- Contracts
- Public Share Links
- Occupancy Watch/Report
- Airbnb Payout Reconciliation
- Santander/Accounting Import
- Mobile employee/client workflows
- Private Reservation staging/sync
