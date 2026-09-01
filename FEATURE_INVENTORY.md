# Owners2 feature inventory

This document is the starting point for simplifying Owners2 without breaking operational integrations or losing historical data. It is an evidence-based inventory, not authorization to delete code or tables.

Snapshot basis:

- Source branch: `develop` after the local-development setup merge
- Database evidence: local clone of the production database, copied 2026-09-01
- Runtime evidence: frontend routes and navigation, Symfony controllers and commands, production cron previously audited on 2026-08-31

## Classification

- **Protect**: operationally critical or connected to an external system. Add tests before changing.
- **Keep**: clearly used and supported by current data or navigation.
- **Review**: implemented and possibly used, but the owner must confirm the workflow.
- **Removal candidate**: strong evidence of duplication, a placeholder, or no current use. Remove only through the retirement process below.
- **Operational issue**: not necessarily obsolete, but currently inconsistent or unsafe.

## Critical integrations

### Airbnb booking email ingestion — Protect

Observed application flow:

```text
external sender
  -> authenticated POST /api/airbnb-import
  -> airbnb_email_import
  -> AirbnbEmailImportListener
  -> BookingProcessingService
  -> all_bookings
  -> booking_month_slice and downstream booking logic
```

Key evidence:

- `airbnb_email_import` contains 1,000 records.
- `all_bookings` contains 1,242 records.
- The repository does not contain a Gmail/IMAP mailbox reader. An external system must be posting parsed email content to `/api/airbnb-import` or importing `.eml` files.
- `/api/airbnb-import` is protected by the general JWT API firewall; the upstream sender therefore depends on an authentication arrangement outside this repository.
- Insertion triggers synchronous processing through `AirbnbEmailImportListener`.
- `app:process-airbnb-imports` provides a recovery/reprocessing command.
- `app:import-airbnb-email <file>` supports manual `.eml` imports.

Do not change this pipeline until we have:

1. Identified the external sender and how it authenticates.
2. Saved representative confirmation, alteration, and cancellation emails.
3. Added parser, deduplication, date-boundary, and downstream side-effect tests.
4. Documented how failures are detected and replayed.

### Airbnb iCal synchronization — Protect

Observed application flow:

```text
unit.airbnb_ical
  -> app:sync-ical
  -> Airbnb HTTP feeds
  -> ical_events
  -> app:reconcile-bookings
  -> booking links, conflicts, alerts, and placeholders
  -> booking calendar and iCal review UI
```

The application also exports private reservations as an iCalendar feed for Airbnb to consume.

Key evidence:

- `ical_events` contains 1,000 records.
- Production runs iCal synchronization every 15 minutes and reconciliation daily.
- The reconciliation service can create placeholder bookings when iCal contains a reservation missing from email ingestion.
- Airbnb uses exclusive `DTEND`; Owners2 booking checkout is also a departure date, so the last occupied night is the previous date.

Required protection:

- Parser fixtures using saved Airbnb ICS responses
- Tests for checkout-day reuse, blocks, cancellations, missing events, and duplicate reservation codes
- Dry-run reconciliation verification before changing matching rules
- Metrics and alerting for failed or stale synchronization

### Booking lifecycle and housekeeping effects — Protect

Bookings feed month slices, calendar availability, financial reports, status updates, holds, housekeeping cleanings, and reconciliations.

Current exact local snapshot counts:

| Data | Rows |
| --- | ---: |
| Bookings | 1,242 |
| Booking month slices | 1,380 |
| Housekeeping cleanings | 868 |
| Housekeeping transactions | 1,262 |
| Housekeeping reconciliation | 201 |

Critical commands include:

- `app:update-booking-status`
- `app:holds:auto-cancel`
- `app:refresh-month-slices`
- `app:recalculate-bookings`
- `app:update-booking-calculations`
- housekeeping backfill commands

These operations must become covered by repeatable tests before booking entities, statuses, or date rules are refactored.

### Documents, S3, reports, and email — Protect external writes

- `unit_document` contains 1,476 records.
- `unit_document_attachment` contains 1,374 records.
- Unit media and document services can write to or delete from S3.
- Report services generate PDFs, signed links, payment requests, and email.
- Local development disables the two UnitMedia S3 mutation listeners and sends mail to Mailpit, but document upload services can still instantiate S3 clients when their endpoints are intentionally called.

Before simplifying these areas, identify every bucket/key convention, signed-link consumer, and outgoing email workflow.

## Feature domains

| Domain | Initial classification | Evidence and recommendation |
| --- | --- | --- |
| Authentication and roles | Keep | Admin, manager, employee, supervisor, and client roles protect desktop and mobile routes. Simplify only after access requirements are documented. |
| Clients, condos, and units | Keep | Core property master data: 30 clients, 25 condos, and 52 units. Used across nearly every operational domain. |
| Bookings table and calendar | Protect | Central system of record with 1,242 rows and multiple downstream consumers. |
| Airbnb email ingestion | Protect | External entry point and 1,000 historical import rows. Upstream sender is not contained in this repository. |
| Airbnb iCal sync and reconciliation | Protect | Frequent production job, 1,000 events, booking fallback and conflict detection. |
| Holds and soft reservations | Protect | Affects availability and automatic expiry. Test before consolidation. |
| Housekeeping cleanings and reconciliation | Keep | High-volume operational data and automatic booking side effects. |
| Housekeeping laundry | Review | 19 laundry records and 3 rate rows. Confirm whether this workflow is still used. |
| Employees and tasks | Keep | 7 employees, 64 tasks, comments, mobile task UI, access generation, and notifications. |
| Employee cash and financial ledgers | Keep | 204 cash rows and 92 financial-ledger rows, with approval and allocation workflows. |
| Unit ledger and balances | Keep, then consolidate | `unit_balance_ledger` has 588 rows and `unit_transactions` has 677 exact rows. The separate `unit_balance` table is empty and may be a derived/cache design; investigate before removal. |
| O2 and HK transactions | Keep | Active financial data and report dependencies. |
| Accounting/Santander import | Review | 106 Santander entries plus accountant imports and entries. Confirm current bank-import workflow. |
| Airbnb payout reconciliation | Keep pending workflow review | 80 payouts and 212 payout items. Older payout tables also contain data, indicating parallel generations that must be reconciled rather than dropped blindly. |
| Monthly owner reports | Keep | Month slices, report cycles, PDF generation, email, payment workflows, and historical financial output. Consolidate duplicate controllers only after contract tests. |
| Occupancy watch/report | Review | Notes and alert state contain data; action log is empty. Confirm which dashboard and report views are used. |
| Unit documents | Keep | High-volume active storage and report dependencies. |
| Unit media | Review | 3 exact media records plus S3 rename/delete logic. Confirm whether this separate feature is still needed alongside unit documents. |
| Unit onboarding inventory | Review | Exact data exists: 1 session, 12 items, and 16 photos, with desktop and mobile workflows. |
| Unit purchase lists/catalog | Review | 24 catalog entries, 1 list, and 10 lines. Confirm whether onboarding purchases remain part of operations. |
| Service providers | Review | One exact provider record and a visible navigation item. Confirm whether this feature is in active use. |
| Contracts | Review | Three draft records and public preview routes. Confirm whether contracts are generated from Owners2 today. |
| Public share links | Review | No current share-token rows, but frontend and backend public exchange routes exist. Confirm whether report sharing is planned or obsolete. |
| Social posts/calendar | Removal candidate | Visible admin navigation and full API/entity implementation, but both social tables contain zero rows. Strong candidate if marketing is managed elsewhere. |
| Settings | Removal candidate | The `/settings` route renders only `Settings Page`; it is a navigation placeholder, not a working feature. |
| Private reservation staging | Review/consolidate | One row, two similarly named sync commands, booking-controller creation, and the newer direct booking flow. Determine the canonical private-booking path. |
| Mobile application | Keep pending role review | Dedicated operational workflows exist for tasks, calendar, check activity, cash, unit details, and inventory. Confirm which employee/client roles actually use them. |

## High-confidence code cleanup candidates

These can be investigated before deleting any business data:

1. Remove the non-functional Settings navigation item and placeholder route if no settings screen is planned.
2. Restrict or remove the `/dev/icons` route from production; its navigation is dev-only, but the route itself is always registered for authenticated users.
3. Review the duplicate booking aliases `/bookings-basic` and `/see-bookings-basic`; retain one temporary redirect only if bookmarks depend on it.
4. Consolidate navigation ownership. `navConfig.js` drives `AppShell`, while `Sidebar.jsx` contains a second manually maintained navigation system and appears disconnected from the current top-level `Layout`.
5. Remove nested layout duplication where pages wrap `PageScaffold` in `AppShell` even though `PageScaffold` already renders `AppShell`.
6. Identify disabled `__legacy__` report routes and old report controller generations, then remove them after endpoint contract tests.
7. Replace duplicated private-reservation synchronization commands with one canonical workflow after confirming production usage.

## Data retirement candidates requiring verification

Do not drop these solely because they look unused:

- `unit_balance_ledger_backup_unit28_20260721` — explicit one-off backup table with 10 rows; export and document before removal.
- `v_test_segments` — test-named production view; confirm no report references it.
- Empty social tables — remove only with the corresponding UI/API feature decision.
- `unit_balance` — empty, but may be intended as a summary/cache table.
- Old and new Airbnb payout tables — both generations contain records.
- `private_reservation` — low volume but still referenced by controllers, services, and commands.
- `share_token` — empty but supports public link exchange.

## Operational issues discovered

### Production cron/source mismatch

The production crontab previously observed invokes:

- `app:process-parsed-airbnb-email`
- `app:relink-parsed-emails`

Neither command name exists in the current repository. Current source provides:

- `app:process-airbnb-imports`
- `app:relink-bookings`

This must be verified read-only in production command output and logs before changing the crontab. The current email insert listener may be doing all successful processing synchronously while the cron commands fail unnoticed.

### Duplicate booking-status schedule

Production runs `app:update-booking-status` at both 01:00 and 02:15. The command also synchronizes housekeeping state, so duplicate scheduling is not automatically harmless even if most updates are idempotent. Retain one schedule only after log and side-effect verification.

### Migration and schema drift

- Migration metadata says all 234 migrations are applied.
- The historical migration chain cannot build a clean database from zero.
- The production-derived schema differs substantially from current ORM mappings.
- `doctrine:schema:update --force` would propose unrelated destructive changes, including removing tables that contain data.

Schema repair must be a dedicated project with backups and focused migrations, never a side effect of feature cleanup.

### Missing automated test suite

PHPUnit is configured but currently discovers no tests on `develop`. The frontend build succeeds with a large warning backlog. Critical integration tests are the prerequisite for aggressive simplification.

### Public report endpoints

Several report preview, PDF, file, and email-related routes are configured as public. Review each public route for its intended consumer, token validation, and data exposure before restructuring reports.

## Safe retirement process

For each feature selected for removal:

1. Confirm with the owner that the workflow is no longer used.
2. Identify frontend routes, navigation, API endpoints, commands, listeners, services, entities, tables, reports, and external callers.
3. Add tests around any shared behavior that remains.
4. Remove or hide the user entry points first.
5. Stop scheduled jobs and writes for that feature.
6. Observe production logs and data activity for an agreed period.
7. Export or archive historical data.
8. Remove backend code in a focused pull request.
9. Remove database structures in a separate reviewed migration with a fresh backup and rollback plan.

## Recommended cleanup order

1. **Verify production-critical operations**: email sender, cron command mismatch, iCal freshness, duplicate status schedule, backups and deployment.
2. **Build the safety net**: tests for email ingestion, iCal, booking overlap/dates, status transitions, holds, and housekeeping side effects.
3. **Remove obvious UI scaffolding**: Settings placeholder, dev route exposure, redundant route aliases, and duplicated layout wrappers.
4. **Owner feature decisions**: marketing, service providers, laundry, contracts, occupancy, inventory/purchases, share links, and mobile role usage.
5. **Consolidate duplicate generations**: navigation/layout, private reservations, reports, payout reconciliation, and transaction models.
6. **Retire data last**: archive and remove confirmed obsolete tables only after code and scheduled writers are gone.

## Owner decisions needed

For the next review, answer **keep**, **remove**, or **unsure** for each:

- Social Posts and Social Calendar
- Settings placeholder
- Service Providers
- Housekeeping Laundry
- Unit onboarding Inventory
- Unit Purchase Lists and Catalog
- Contracts
- Public Share Links
- Occupancy Watch/Report
- Airbnb Payout Reconciliation
- Santander/Accounting Import
- Mobile employee/client workflows
- Private Reservation staging/sync

Until those decisions are recorded, all classifications above remain recommendations.
